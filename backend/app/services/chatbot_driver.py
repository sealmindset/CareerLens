"""Chatbot driver -- drives Paradox.ai/Olivia-style chatbot job applications.

Two modes:
1. Playwright mode (real bots): Drives the chatbot through browser automation.
   Required for real Paradox.ai because the answer POST payload is built by
   client-side JavaScript with many context fields, and responses arrive via
   XHR polling (queued: true pattern).
2. API mode (mock-olivia): Calls the chatbot's REST API directly.
   Faster and more reliable for local development/testing.

The driver:
1. Initializes a chat session
2. Reads bot questions
3. Maps questions to profile data using keyword rules + AI fallback
4. Sends answers and waits for the next question
5. Detects conversation completion

Returns a transcript of the full conversation and the final state.
"""

import asyncio
import html as html_lib
import json
import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    """A single message in the chatbot conversation."""
    sender: str  # "bot" or "user"
    text: str
    step: str = ""  # which profile field this maps to


@dataclass
class ChatbotResult:
    """Result of driving a chatbot conversation."""
    url: str
    success: bool = False
    messages: list[ChatMessage] = field(default_factory=list)
    candidate_data_sent: dict = field(default_factory=dict)
    error: str | None = None
    completed: bool = False  # did we reach the confirmation/done step?


# ─── Question-to-field mapping rules ────────────────────────────────────────

KEYWORD_FIELD_MAP = [
    # (keywords_any, keywords_all, field_name, answer_format)
    (["first", "last", "full", "name"], ["name"], "full_name", "text"),
    (["phone", "mobile", "cell", "number to reach", "phone number"], [], "phone", "phone"),
    (["email", "e-mail", "email address"], [], "email", "email"),
    (["authorized", "authorization", "legally", "work in the"], [], "work_authorized", "yes_no"),
    (["sponsorship", "visa", "sponsor"], [], "needs_sponsorship", "yes_no"),
    (["experience", "years", "how long", "how many years"], [], "years_experience", "number"),
    (["relocat", "willing to move", "open to relocation"], [], "willing_to_relocate", "yes_no"),
    (["salary", "compensation", "pay", "wage", "expectations"], [], "salary_expectation", "text"),
    (["resume", "cv", "upload", "attach"], [], "resume", "skip_or_upload"),
]


def map_question_to_field(question: str) -> tuple[str, str] | None:
    """Map a bot question to a profile field using keyword rules.

    Returns (field_name, answer_format) or None if no match.
    """
    q_lower = question.lower()

    for keywords_any, keywords_all, field_name, fmt in KEYWORD_FIELD_MAP:
        if keywords_all and not all(k in q_lower for k in keywords_all):
            continue
        if keywords_any and any(k in q_lower for k in keywords_any):
            return (field_name, fmt)

    return None


def format_answer(field_name: str, answer_format: str, profile_data: dict) -> str | None:
    """Format a profile value as a chatbot answer."""
    if answer_format == "skip_or_upload":
        return "skip"

    if answer_format == "yes_no":
        val = profile_data.get(field_name)
        if val is None:
            defaults = {
                "work_authorized": "Yes",
                "needs_sponsorship": "No",
                "willing_to_relocate": "Yes",
            }
            return defaults.get(field_name, "Yes")
        return "Yes" if val else "No"

    if answer_format == "phone":
        phone = profile_data.get("phone", "")
        return phone if phone else None

    if answer_format == "number":
        val = profile_data.get(field_name)
        if val is not None:
            return str(val)
        years = profile_data.get("years_experience", 0)
        if years:
            return str(years)
        exp_count = len(profile_data.get("experiences", []))
        return str(max(exp_count * 2, 1)) if exp_count else "5"

    # Default: text
    val = profile_data.get(field_name, "")
    return str(val) if val else None


def _is_mock_olivia(url: str) -> bool:
    """Check if a URL points to mock-olivia (local dev)."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    return hostname in ("mock-olivia", "localhost") and "paradox.ai" not in hostname


# ─── Playwright-based driver (real Paradox.ai bots) ─────────────────────────


async def _drive_playwright(
    url: str,
    profile_data: dict,
    ai_mapper=None,
    timeout_ms: int = 90000,
) -> ChatbotResult:
    """Drive a real Paradox.ai chatbot via Playwright browser automation.

    Real Paradox.ai requires browser context because:
    - The answer POST body is built by client-side JS with many context fields
    - Responses use `queued: true` pattern and arrive via XHR polling
    - The API rejects non-browser requests (no cookies/session)
    """
    result = ChatbotResult(url=url)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        result.error = "Playwright is not installed."
        return result

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            ctx = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                ignore_https_errors=True,  # Handle corporate SSL proxies (Zscaler)
            )
            page = await ctx.new_page()

            # Capture answer and xhr responses for reading bot messages
            answer_responses: list[dict] = []

            async def on_response(resp):
                if "/answer" in resp.url or "/xhr" in resp.url:
                    if "sentry" not in resp.url:
                        try:
                            body = await resp.json()
                            answer_responses.append(body)
                        except Exception:
                            pass

            page.on("response", on_response)

            logger.info("Chatbot driver (Playwright): navigating to %s", url)
            await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            await asyncio.sleep(3)

            # Read initial bot messages from the DOM
            initial_msgs = await _read_dom_messages(page)
            for text in initial_msgs:
                result.messages.append(ChatMessage(sender="bot", text=text))

            # Conversation loop
            max_turns = 15
            sent_fields: set[str] = set()

            for turn in range(max_turns):
                # Get latest bot question -- prefer API response, fallback to DOM
                latest_question = _get_latest_bot_from_responses(answer_responses)
                if not latest_question:
                    dom_msgs = await _read_dom_messages(page)
                    latest_question = dom_msgs[-1] if dom_msgs else ""

                if not latest_question:
                    logger.warning("Chatbot driver: no bot message at turn %d", turn + 1)
                    await asyncio.sleep(2)
                    continue

                # Check if done
                if _is_conversation_done(latest_question):
                    result.completed = True
                    result.success = True
                    logger.info("Chatbot driver: completed after %d turns", turn + 1)
                    break

                # Map question to profile field
                mapping = map_question_to_field(latest_question)
                answer = None

                if mapping:
                    field_name, answer_format = mapping
                    # Don't re-send the same field (bot may be re-asking due to validation)
                    if field_name in sent_fields and field_name == "phone":
                        # Phone validation failed -- the bot keeps asking
                        # Try the phone value again (user may need to fix their profile)
                        answer = format_answer(field_name, answer_format, profile_data)
                    else:
                        answer = format_answer(field_name, answer_format, profile_data)
                    if answer:
                        result.candidate_data_sent[field_name] = answer
                        sent_fields.add(field_name)

                # AI fallback
                if answer is None and ai_mapper:
                    try:
                        answer = await ai_mapper(latest_question, profile_data)
                    except Exception as e:
                        logger.warning("AI mapper failed: %s", e)

                if answer is None:
                    answer = _default_answer(latest_question, profile_data)

                logger.info(
                    "Chatbot turn %d: Q='%s...' A='%s'",
                    turn + 1, latest_question[:60], answer[:60],
                )

                # Clear answer_responses before sending so we can detect new ones
                answer_responses.clear()

                # Type and send
                input_el = await page.query_selector(
                    "#widget_composer_input, textarea[role='textbox'], textarea"
                )
                if not input_el:
                    result.error = "Could not find chat input element"
                    break

                await input_el.click()
                await input_el.fill(answer)
                await asyncio.sleep(0.3)
                await input_el.press("Enter")

                result.messages.append(ChatMessage(
                    sender="user",
                    text=answer,
                    step=mapping[0] if mapping else "unknown",
                ))

                # Wait for bot response (answer + possible XHR poll)
                await asyncio.sleep(4)

                # Read new bot messages from response
                new_bot_texts = _get_all_bot_texts_from_responses(answer_responses)
                for text in new_bot_texts:
                    result.messages.append(ChatMessage(sender="bot", text=text))

            if not result.completed and turn >= max_turns - 1:
                result.error = f"Conversation did not complete within {max_turns} turns."

            await browser.close()

    except Exception as e:
        logger.error("Chatbot driver (Playwright) failed: %s", str(e))
        result.error = f"Could not drive chatbot: {str(e)[:200]}"

    return result


async def _read_dom_messages(page) -> list[str]:
    """Read bot messages from the Paradox.ai DOM.

    Real Paradox.ai uses CSS module hashes (e.g., _965ed5) instead of semantic classes.
    We look for .olivia-msg-bubble elements that are NOT inside user message containers.
    """
    try:
        messages = await page.evaluate("""() => {
            const msgs = [];
            const bubbles = document.querySelectorAll('.olivia-msg-bubble');
            for (const b of bubbles) {
                // Check if this is a bot message (not user)
                const parent = b.closest('[class*="me-messages__item"]') ||
                               b.closest('[class*="messages__item"]') ||
                               b.parentElement;
                // User messages typically have class containing 'theirs' or 'sent'
                const parentClass = parent?.className || '';
                if (parentClass.includes('theirs') || parentClass.includes('sent')) continue;

                // Get just the text content (skip screen reader spans)
                const text = b.childNodes[0]?.textContent?.trim() || '';
                if (text && text.length > 2) msgs.push(text);
            }
            return msgs;
        }""")
        return messages or []
    except Exception as e:
        logger.warning("Failed to read DOM messages: %s", e)
        return []


def _get_latest_bot_from_responses(responses: list[dict]) -> str:
    """Extract the latest bot message text from captured API responses."""
    for resp in reversed(responses):
        messages = resp.get("messages", [])
        bot_msgs = [m for m in messages if m.get("type") == "ours"]
        if bot_msgs:
            text = bot_msgs[-1].get("text", "")
            return html_lib.unescape(text)
    return ""


def _get_all_bot_texts_from_responses(responses: list[dict]) -> list[str]:
    """Extract all bot message texts from captured API responses."""
    texts = []
    seen = set()
    for resp in responses:
        for msg in resp.get("messages", []):
            if msg.get("type") == "ours":
                msg_id = msg.get("id", msg.get("org_id", ""))
                if msg_id in seen:
                    continue
                seen.add(msg_id)
                text = html_lib.unescape(msg.get("text", ""))
                if text:
                    texts.append(text)
    return texts


# ─── API-based driver (mock-olivia) ─────────────────────────────────────────


async def _drive_api(
    url: str,
    profile_data: dict,
    ai_mapper=None,
    timeout_ms: int = 60000,
) -> ChatbotResult:
    """Drive mock-olivia via direct REST API calls (fast, reliable for local dev)."""
    import httpx

    result = ChatbotResult(url=url)
    parsed = urlparse(url)
    api_base = f"{parsed.scheme}://{parsed.netloc}"
    params = parse_qs(parsed.query)
    job_id = params.get("job_id", [""])[0]
    widget_id = "mockwidget001"

    try:
        async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
            # Init session
            init_resp = await client.get(
                f"{api_base}/api/widget/{widget_id}",
                params={"source": 2, "job_id": job_id},
            )
            init_resp.raise_for_status()
            init_data = init_resp.json()

            session_id = init_data.get("session_id", "")
            conversation_id = init_data.get("candidate", {}).get("conversation_id", 0)

            for msg in init_data.get("messages", []):
                if msg.get("type") == "ours":
                    result.messages.append(ChatMessage(sender="bot", text=msg["text"]))

            # Conversation loop
            max_turns = 15
            for turn in range(max_turns):
                bot_msgs = [m for m in result.messages if m.sender == "bot"]
                if not bot_msgs:
                    break
                latest_question = bot_msgs[-1].text

                if _is_conversation_done(latest_question):
                    result.completed = True
                    result.success = True
                    break

                mapping = map_question_to_field(latest_question)
                answer = None

                if mapping:
                    field_name, answer_format = mapping
                    answer = format_answer(field_name, answer_format, profile_data)
                    if answer:
                        result.candidate_data_sent[field_name] = answer

                if answer is None and ai_mapper:
                    try:
                        answer = await ai_mapper(latest_question, profile_data)
                    except Exception as e:
                        logger.warning("AI mapper failed: %s", e)

                if answer is None:
                    answer = _default_answer(latest_question, profile_data)

                logger.info("Chatbot turn %d: Q='%s...' A='%s'",
                            turn + 1, latest_question[:60], answer[:60])

                resp = await client.post(
                    f"{api_base}/api/widget/{widget_id}/answer",
                    json={
                        "message": answer,
                        "session_id": session_id,
                        "conversation_id": conversation_id,
                        "job_id": job_id,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                result.messages.append(ChatMessage(
                    sender="user", text=answer,
                    step=mapping[0] if mapping else "unknown",
                ))

                for msg in data.get("messages", []):
                    if msg.get("type") == "ours":
                        result.messages.append(ChatMessage(sender="bot", text=msg["text"]))

            if not result.completed and turn >= max_turns - 1:
                result.error = f"Conversation did not complete within {max_turns} turns."

    except Exception as e:
        logger.error("Chatbot driver (API) failed: %s", str(e))
        result.error = f"Could not drive chatbot: {str(e)[:200]}"

    return result


# ─── Public entry point ─────────────────────────────────────────────────────


async def drive_chatbot(
    url: str,
    profile_data: dict,
    ai_mapper=None,
    timeout_ms: int = 90000,
) -> ChatbotResult:
    """Drive a conversational chatbot through its full application flow.

    Automatically selects the best driver:
    - mock-olivia (localhost/docker): fast API mode
    - Real Paradox.ai: Playwright browser mode
    """
    if _is_mock_olivia(url):
        logger.info("Chatbot driver: using API mode (mock-olivia) for %s", url)
        return await _drive_api(url, profile_data, ai_mapper, timeout_ms)
    else:
        logger.info("Chatbot driver: using Playwright mode (real bot) for %s", url)
        return await _drive_playwright(url, profile_data, ai_mapper, timeout_ms)


# ─── Shared helpers ─────────────────────────────────────────────────────────


def _is_conversation_done(message: str) -> bool:
    """Check if a bot message indicates the conversation is complete."""
    done_indicators = [
        "has been submitted",
        "application is submitted",
        "been submitted",
        "submitted successfully",
        "will review your",
        "recruiter will",
        "good luck",
        "thank you for applying",
        "already been submitted",
        "application has already",
    ]
    msg_lower = message.lower()
    return any(indicator in msg_lower for indicator in done_indicators)


def _default_answer(question: str, profile_data: dict) -> str:
    """Generate a safe default answer when no mapping is found."""
    q_lower = question.lower()

    if "name" in q_lower:
        return profile_data.get("full_name", "John Doe")
    if "phone" in q_lower or "number" in q_lower:
        return profile_data.get("phone", "602-867-5309")
    if "email" in q_lower:
        return profile_data.get("email", "applicant@example.com")
    if any(w in q_lower for w in ["yes", "no", "are you", "do you", "will you", "can you"]):
        return "Yes"

    return "Yes"


def chatbot_result_to_transcript(result: ChatbotResult) -> str:
    """Format a ChatbotResult as a readable markdown transcript."""
    lines = [
        "# Chatbot Application Transcript",
        "",
        f"**URL:** {result.url}",
        f"**Status:** {'Completed' if result.completed else 'Incomplete'}",
        f"**Messages exchanged:** {len(result.messages)}",
        "",
    ]

    if result.error:
        lines.append(f"> **Error:** {result.error}")
        lines.append("")

    lines.append("## Conversation")
    lines.append("")

    for msg in result.messages:
        if msg.sender == "bot":
            lines.append(f"**Bot:** {msg.text}")
        else:
            step_note = f" *({msg.step})*" if msg.step and msg.step != "unknown" else ""
            lines.append(f"**You:** {msg.text}{step_note}")
        lines.append("")

    if result.candidate_data_sent:
        lines.append("## Data Submitted")
        lines.append("")
        lines.append("| Field | Value |")
        lines.append("|-------|-------|")
        for field_name, value in result.candidate_data_sent.items():
            display_name = field_name.replace("_", " ").title()
            lines.append(f"| {display_name} | {value} |")
        lines.append("")

    return "\n".join(lines)
