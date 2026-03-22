"""Application Form service -- powers the Auto-Fill modal.

Two modes based on detected application method:
1. CHATBOT mode (Paradox/Olivia): Simulate chatbot → present Q&A for user review →
   drive real chatbot with approved answers → verify simulation matches live.
2. FORM mode (traditional forms/portals): Generate pre-populated form fields from
   profile + job data using AI, check completeness, best-fit review.
"""

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application
from app.models.job import JobListing
from app.models.profile import Profile
from app.models.user import User
from app.models.workspace import AgentWorkspace
from app.schemas.workspace import (
    ApplicationFormData,
    ApplicationFormField,
    BestFitReviewResult,
    ChatbotSimulationResult,
    ChatbotSubmitResult,
    ChatbotQuestionItem,
    CompletenessCheckResult,
    DetectedMethodResult,
)
from app.services.agents.base import (
    call_agent_ai,
    load_agent_context,
)
from app.services.workspace_service import get_latest_artifact

logger = logging.getLogger(__name__)


# ─── Shared helpers ──────────────────────────────────────────────────────────


def _extract_profile_data(profile: Profile | None, user: User | None) -> dict:
    """Extract structured profile data for form population."""
    data = {
        "full_name": "",
        "email": "",
        "phone": "",
        "linkedin_url": "",
        "headline": "",
        "summary": "",
        "current_title": "",
        "current_company": "",
        "skills": [],
        "experiences": [],
        "educations": [],
    }
    if not profile:
        return data

    if user:
        data["full_name"] = user.display_name or user.email or ""
        data["email"] = user.email or ""

    if profile.user:
        data["full_name"] = data["full_name"] or profile.user.display_name or ""
        data["email"] = data["email"] or profile.user.email or ""

    data["linkedin_url"] = profile.linkedin_url or ""
    data["headline"] = profile.headline or ""
    data["summary"] = profile.summary or ""

    if profile.experiences:
        current = next((e for e in profile.experiences if e.is_current), None)
        latest = current or profile.experiences[0]
        data["current_title"] = latest.title
        data["current_company"] = latest.company
        for exp in profile.experiences:
            data["experiences"].append({
                "title": exp.title,
                "company": exp.company,
                "start_date": str(exp.start_date) if exp.start_date else "",
                "end_date": str(exp.end_date) if exp.end_date else "Present",
                "description": exp.description or "",
            })

    if profile.skills:
        data["skills"] = [s.skill_name for s in profile.skills]

    if profile.educations:
        for edu in profile.educations:
            data["educations"].append({
                "institution": edu.institution,
                "degree": edu.degree or "",
                "field_of_study": edu.field_of_study or "",
            })

    return data


async def _load_workspace_context(db, user_id, workspace):
    """Load application, job, profile, user for a workspace."""
    app_result = await db.execute(
        select(Application).where(Application.id == workspace.application_id)
    )
    application = app_result.scalar_one()
    job = application.job_listing

    prof_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = prof_result.scalar_one_or_none()

    user_result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()

    return application, job, profile, user


# ─── Method detection ────────────────────────────────────────────────────────


async def detect_method(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace: AgentWorkspace,
) -> DetectedMethodResult:
    """Detect the application method for the job in this workspace."""
    application, job, _, _ = await _load_workspace_context(db, user_id, workspace)

    method = job.application_method or "unknown"
    platform = job.application_platform or "unknown"

    # If not yet detected, run detection
    if method == "unknown":
        from app.services.application_detector import detect_application_method
        result = await detect_application_method(job.url or "", use_ai=True)
        method = result.method
        platform = result.platform
        job.application_method = method
        job.application_platform = platform
        job.application_method_details = result.details
        await db.commit()

    return DetectedMethodResult(
        method=method,
        platform=platform,
        job_title=job.title or "Untitled",
        job_company=job.company or "Unknown",
        job_url=job.url or "",
    )


# ─── Chatbot simulation ─────────────────────────────────────────────────────


async def simulate_chatbot(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace: AgentWorkspace,
) -> ChatbotSimulationResult:
    """Probe the chatbot to collect questions, then generate AI-suggested answers.

    Does NOT submit answers -- just collects questions and prepares suggestions
    for the user to review.
    """
    application, job, profile, user = await _load_workspace_context(db, user_id, workspace)
    profile_data = _extract_profile_data(profile, user)

    # Import chatbot utilities
    from app.services.chatbot_driver import (
        map_question_to_field,
        format_answer,
        _is_mock_olivia,
    )

    questions: list[ChatbotQuestionItem] = []

    # Probe the chatbot to get its questions
    if job.url:
        probe_questions = await _probe_chatbot_questions(job.url, profile_data)
    else:
        probe_questions = []

    if not probe_questions:
        # Fallback: use common chatbot question patterns for the platform
        probe_questions = _get_common_chatbot_questions(job.application_platform or "paradox.ai")

    # Load workspace context for AI calls
    context = await load_agent_context(db, user_id, workspace.id, workspace.application_id)
    tailored_resume = await get_latest_artifact(db, workspace.id, "tailored_resume")
    cover_letter = await get_latest_artifact(db, workspace.id, "cover_letter")

    # For each question, generate a suggested answer
    for i, q_text in enumerate(probe_questions):
        # Try keyword mapping first
        mapping = map_question_to_field(q_text)
        suggested = None
        field_name = "unknown"
        confidence = "medium"

        if mapping:
            field_name, answer_format = mapping
            suggested = format_answer(field_name, answer_format, profile_data)
            if suggested:
                confidence = "high"

        # AI fallback for unmapped or empty suggestions
        if not suggested:
            try:
                ai_prompt = (
                    f"A chatbot for a job application asked this question:\n\n"
                    f"\"{q_text}\"\n\n"
                    f"## Candidate Profile\n{json.dumps(profile_data, indent=2, default=str)}\n\n"
                    f"## Job: {job.title} at {job.company}\n\n"
                )
                if tailored_resume:
                    ai_prompt += f"## Tailored Resume (excerpt)\n{tailored_resume.content[:1500]}\n\n"
                if cover_letter:
                    ai_prompt += f"## Cover Letter (excerpt)\n{cover_letter.content[:1000]}\n\n"

                ai_prompt += (
                    "Respond with ONLY the answer the candidate should give. "
                    "Keep it natural and appropriate for a chatbot conversation. "
                    "If it's a yes/no question, answer Yes or No then briefly explain if needed. "
                    "For open-ended questions, keep it to 1-3 sentences max."
                )
                suggested = await call_agent_ai(context.db, "auto_fill", ai_prompt, context)
                confidence = "medium"
                field_name = "ai_generated"
            except Exception as e:
                logger.warning("AI suggestion failed for question '%s': %s", q_text[:40], e)
                suggested = ""
                confidence = "low"

        questions.append(ChatbotQuestionItem(
            index=i,
            question=q_text,
            suggested_answer=suggested or "",
            field_name=field_name,
            confidence=confidence,
        ))

    return ChatbotSimulationResult(
        method="chatbot",
        platform=job.application_platform or "unknown",
        job_title=job.title or "Untitled",
        job_company=job.company or "Unknown",
        job_url=job.url or "",
        questions=questions,
        total_questions=len(questions),
    )


async def _probe_chatbot_questions(url: str, profile_data: dict) -> list[str]:
    """Probe a chatbot to collect its questions WITHOUT submitting real answers.

    Strategy: Start a session, read the first question, send a minimal answer to
    advance, read the next question, etc. Use throwaway/dummy answers that won't
    create a real application.
    """
    from app.services.chatbot_driver import (
        _is_mock_olivia,
        map_question_to_field,
        format_answer,
        _is_conversation_done,
    )

    questions = []

    if _is_mock_olivia(url):
        # API mode -- fast probing via REST
        questions = await _probe_api(url, profile_data)
    else:
        # For real chatbots, use Playwright to collect questions
        questions = await _probe_playwright(url, profile_data)

    return questions


async def _probe_api(url: str, profile_data: dict) -> list[str]:
    """Probe mock-olivia via API to collect questions."""
    import httpx
    from urllib.parse import urlparse, parse_qs
    from app.services.chatbot_driver import (
        map_question_to_field,
        format_answer,
        _is_conversation_done,
    )

    questions = []
    parsed = urlparse(url)
    api_base = f"{parsed.scheme}://{parsed.netloc}"
    params = parse_qs(parsed.query)
    job_id = params.get("job_id", [""])[0]
    widget_id = "mockwidget001"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Init session
            init_resp = await client.get(
                f"{api_base}/api/widget/{widget_id}",
                params={"source": 2, "job_id": job_id},
            )
            init_resp.raise_for_status()
            init_data = init_resp.json()

            session_id = init_data.get("session_id", "")
            conversation_id = init_data.get("candidate", {}).get("conversation_id", 0)

            # Collect initial bot messages
            for msg in init_data.get("messages", []):
                if msg.get("type") == "ours":
                    text = msg.get("text", "").strip()
                    if text and not _is_conversation_done(text):
                        questions.append(text)

            # Drive through the conversation to collect all questions
            max_turns = 15
            for turn in range(max_turns):
                if not questions:
                    break

                latest = questions[-1]
                if _is_conversation_done(latest):
                    break

                # Generate a minimal answer to advance
                mapping = map_question_to_field(latest)
                if mapping:
                    answer = format_answer(mapping[0], mapping[1], profile_data) or "Yes"
                else:
                    answer = profile_data.get("full_name", "Test User") if "name" in latest.lower() else "Yes"

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

                for msg in data.get("messages", []):
                    if msg.get("type") == "ours":
                        text = msg.get("text", "").strip()
                        if text:
                            questions.append(text)

    except Exception as e:
        logger.warning("Chatbot probe (API) failed: %s", e)

    # Filter out completion messages
    from app.services.chatbot_driver import _is_conversation_done
    questions = [q for q in questions if not _is_conversation_done(q)]

    return questions


async def _probe_playwright(url: str, profile_data: dict) -> list[str]:
    """Probe a real chatbot via Playwright to collect questions.

    For real chatbots we can't easily probe without affecting state,
    so we use common question patterns for known platforms instead.
    """
    # For safety, don't actually interact with real chatbots during simulation
    # Instead, return common questions for the detected platform
    return []


def _get_common_chatbot_questions(platform: str) -> list[str]:
    """Return common chatbot questions for known platforms."""
    # Paradox.ai / Olivia standard flow
    if "paradox" in platform.lower() or "olivia" in platform.lower():
        return [
            "Hi! I'm Olivia, the virtual recruiting assistant. What is your full name?",
            "What is your email address?",
            "What is your phone number?",
            "Are you legally authorized to work in the United States?",
            "Will you now or in the future require visa sponsorship?",
            "How many years of relevant experience do you have?",
            "Are you willing to relocate for this position?",
            "What are your salary expectations for this role?",
            "Do you have your resume ready to share?",
        ]
    # Generic chatbot
    return [
        "What is your full name?",
        "What is your email address?",
        "What is your phone number?",
        "Are you authorized to work in this country?",
        "How many years of relevant experience do you have?",
        "What are your salary expectations?",
        "When are you available to start?",
    ]


# ─── Chatbot submission ─────────────────────────────────────────────────────


async def submit_to_chatbot(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace: AgentWorkspace,
    approved_answers: list[ChatbotQuestionItem],
) -> ChatbotSubmitResult:
    """Drive the real chatbot with user-approved answers and verify against simulation."""
    application, job, profile, user = await _load_workspace_context(db, user_id, workspace)
    profile_data = _extract_profile_data(profile, user)

    # Build profile_data override with approved answers
    approved_map = {}
    for item in approved_answers:
        if item.approved_answer:
            approved_map[item.field_name] = item.approved_answer

    # Override profile_data with approved answers where field names match
    for field, value in approved_map.items():
        if field in profile_data:
            profile_data[field] = value

    # Drive the chatbot with approved answers
    from app.services.chatbot_driver import drive_chatbot, chatbot_result_to_transcript

    # Custom mapper that uses approved answers instead of AI
    answer_queue = [item.approved_answer for item in approved_answers if item.approved_answer]
    answer_idx = [0]  # mutable counter

    async def approved_mapper(question: str, pdata: dict) -> str:
        """Use the next approved answer from the queue."""
        if answer_idx[0] < len(answer_queue):
            ans = answer_queue[answer_idx[0]]
            answer_idx[0] += 1
            return ans
        return "Yes"

    result = await drive_chatbot(
        url=job.url or "",
        profile_data=profile_data,
        ai_mapper=approved_mapper,
    )

    # Build verification: compare simulated questions with actual questions
    live_questions = [m.text for m in result.messages if m.sender == "bot"]
    simulated_questions = [item.question for item in approved_answers]
    verification = _verify_simulation(simulated_questions, live_questions)

    # Save transcript as artifact
    from app.services.workspace_service import save_artifact
    transcript = chatbot_result_to_transcript(result)
    await save_artifact(
        db=db,
        workspace_id=workspace.id,
        agent_name="auto_fill",
        artifact_type="chatbot_transcript",
        title=f"Chatbot Application: {job.title} at {job.company}",
        content=transcript,
    )

    # Update application status if successful
    if result.completed:
        from datetime import datetime, timezone
        application.status = "submitted"
        application.submitted_at = datetime.now(timezone.utc)
        await db.commit()

    return ChatbotSubmitResult(
        success=result.completed,
        messages_exchanged=len(result.messages),
        data_submitted=result.candidate_data_sent,
        verification=verification,
        error=result.error,
        completed=result.completed,
    )


def _verify_simulation(
    simulated: list[str],
    live: list[str],
) -> list[dict]:
    """Compare simulated chatbot questions with actual live questions.

    Returns a list of verification items showing matches and mismatches.
    """
    verification = []

    # Simple fuzzy matching: compare each simulated question with live questions
    matched_live = set()
    for sim_q in simulated:
        sim_lower = sim_q.lower().strip()
        best_match = None
        best_score = 0

        for i, live_q in enumerate(live):
            if i in matched_live:
                continue
            live_lower = live_q.lower().strip()
            # Simple word overlap score
            sim_words = set(sim_lower.split())
            live_words = set(live_lower.split())
            if not sim_words or not live_words:
                continue
            overlap = len(sim_words & live_words) / max(len(sim_words), len(live_words))
            if overlap > best_score:
                best_score = overlap
                best_match = i

        if best_match is not None and best_score > 0.4:
            matched_live.add(best_match)
            verification.append({
                "simulated": sim_q,
                "live": live[best_match],
                "match": "exact" if best_score > 0.8 else "partial",
                "score": round(best_score, 2),
            })
        else:
            verification.append({
                "simulated": sim_q,
                "live": None,
                "match": "missing",
                "score": 0,
            })

    # Check for unexpected live questions
    for i, live_q in enumerate(live):
        if i not in matched_live:
            verification.append({
                "simulated": None,
                "live": live_q,
                "match": "unexpected",
                "score": 0,
            })

    return verification


# ─── Traditional form generation ─────────────────────────────────────────────

FORM_FIELDS = [
    {"key": "full_name", "label": "Full Name", "section": "personal", "type": "text"},
    {"key": "email", "label": "Email Address", "section": "personal", "type": "email"},
    {"key": "phone", "label": "Phone Number", "section": "personal", "type": "tel"},
    {"key": "linkedin_url", "label": "LinkedIn Profile URL", "section": "personal", "type": "url"},
    {"key": "current_title", "label": "Current Job Title", "section": "professional", "type": "text"},
    {"key": "resume_summary", "label": "Resume Summary / Professional Summary", "section": "professional", "type": "textarea"},
    {"key": "cover_letter", "label": "Cover Letter", "section": "professional", "type": "textarea"},
    {"key": "why_interested", "label": "Why are you interested in this role?", "section": "additional", "type": "textarea"},
    {"key": "salary_expectations", "label": "Salary Expectations", "section": "additional", "type": "text", "required": False},
    {"key": "availability", "label": "Availability / Earliest Start Date", "section": "additional", "type": "text"},
    {"key": "work_authorization", "label": "Work Authorization", "section": "additional", "type": "select",
     "options": ["Authorized to work", "Require sponsorship", "Prefer not to answer"]},
]


async def generate_form_data(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace: AgentWorkspace,
) -> ApplicationFormData:
    """Generate AI-populated form data from profile + job (non-chatbot applications)."""
    application, job, profile, user = await _load_workspace_context(db, user_id, workspace)
    profile_data = _extract_profile_data(profile, user)

    context = await load_agent_context(db, user_id, workspace.id, workspace.application_id)
    tailored_resume = await get_latest_artifact(db, workspace.id, "tailored_resume")
    cover_letter = await get_latest_artifact(db, workspace.id, "cover_letter")

    prompt = f"""You are filling out a job application form. Generate the best possible content
for each field based on the candidate's profile and the target job.

## Candidate Profile
{json.dumps(profile_data, indent=2, default=str)}

## Target Job
Title: {job.title}
Company: {job.company}
Location: {job.location or "Not specified"}
Description: {(job.description or "")[:2000]}

## Available Tailored Documents
- Tailored Resume: {"Available" if tailored_resume else "Not generated yet"}
- Cover Letter: {"Available" if cover_letter else "Not generated yet"}

{f"## Tailored Resume Content{chr(10)}{tailored_resume.content[:3000]}" if tailored_resume else ""}
{f"## Cover Letter Content{chr(10)}{cover_letter.content[:3000]}" if cover_letter else ""}

## Instructions
Generate a JSON object with these exact keys and tailored values:
1. "resume_summary": A compelling 3-4 sentence professional summary tailored to this specific role.
2. "cover_letter": A complete, well-structured cover letter (3-4 paragraphs) tailored to this role.
3. "why_interested": A genuine, specific answer about why the candidate wants this role (2-3 sentences).
4. "salary_expectations": Leave as empty string.
5. "availability": A reasonable response based on current employment status.

Return ONLY a JSON object with these 5 keys. No other text."""

    try:
        ai_response = await call_agent_ai(db, "auto_fill", prompt, context)
        ai_data = _parse_json_response(ai_response)
    except Exception as e:
        logger.warning("AI form generation failed: %s, using profile data only", e)
        ai_data = {}

    fields = []
    for field_def in FORM_FIELDS:
        key = field_def["key"]
        value = ""
        if key in profile_data and isinstance(profile_data[key], str):
            value = profile_data[key]
        if key in ai_data and ai_data[key]:
            value = str(ai_data[key])
        fields.append(ApplicationFormField(
            key=key,
            label=field_def["label"],
            value=value,
            field_type=field_def["type"],
            options=field_def.get("options"),
            required=field_def.get("required", True),
            section=field_def["section"],
        ))

    return ApplicationFormData(
        fields=fields,
        job_title=job.title or "Untitled",
        job_company=job.company or "Unknown",
    )


# ─── Completeness check ─────────────────────────────────────────────────────


def check_completeness(fields: list[ApplicationFormField]) -> CompletenessCheckResult:
    """Check all required fields are filled out and flag issues."""
    issues = []
    filled = 0
    total = len(fields)

    for field in fields:
        val = (field.value or "").strip()
        if field.required and not val:
            issues.append({
                "field_key": field.key,
                "field_label": field.label,
                "issue": "This required field is empty.",
            })
        elif field.required and field.field_type == "textarea" and len(val) < 20:
            issues.append({
                "field_key": field.key,
                "field_label": field.label,
                "issue": "This field seems too short. Consider adding more detail.",
            })
            filled += 1
        elif field.field_type == "email" and val and "@" not in val:
            issues.append({
                "field_key": field.key,
                "field_label": field.label,
                "issue": "This doesn't look like a valid email address.",
            })
            filled += 1
        else:
            if val:
                filled += 1

    return CompletenessCheckResult(
        complete=len(issues) == 0,
        total_fields=total,
        filled_fields=filled,
        issues=issues,
    )


# ─── Best-fit review ────────────────────────────────────────────────────────


async def review_best_fit(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace: AgentWorkspace,
    fields: list[ApplicationFormField],
) -> BestFitReviewResult:
    """AI-powered review of the application against job requirements."""
    application, job, _, _ = await _load_workspace_context(db, user_id, workspace)
    form_content = {f.label: f.value or "(empty)" for f in fields}
    context = await load_agent_context(db, user_id, workspace.id, workspace.application_id)

    prompt = f"""You are a senior hiring manager reviewing a job application. Analyze this
application form and determine how well it presents the candidate for the specific role.

## Job Being Applied For
Title: {job.title}
Company: {job.company}
Description: {(job.description or "")[:2000]}

Requirements:
{chr(10).join(f"- {r.requirement_text}" for r in (job.requirements or [])) or "Not specified"}

## Application Form Content
{json.dumps(form_content, indent=2)}

## Your Review
Return a JSON object with:
1. "score": Integer 1-100
2. "verdict": One of "strong", "good", or "needs_work"
3. "summary": 2-3 sentence overall assessment
4. "strengths": Array of 2-4 strengths (strings)
5. "improvements": Array of objects with field_key, field_label, current_value, suggestion

Return ONLY the JSON object."""

    try:
        ai_response = await call_agent_ai(db, "auto_fill", prompt, context)
        review = _parse_json_response(ai_response)
    except Exception as e:
        logger.error("Best-fit review failed: %s", e)
        return BestFitReviewResult(
            score=0, verdict="needs_work",
            summary="Unable to complete the review. Please try again.",
            strengths=[], improvements=[],
        )

    return BestFitReviewResult(
        score=min(100, max(1, int(review.get("score", 50)))),
        verdict=review.get("verdict", "good"),
        summary=review.get("summary", "Review completed."),
        strengths=review.get("strengths", []),
        improvements=review.get("improvements", []),
    )


# ─── JSON parsing helper ────────────────────────────────────────────────────


def _parse_json_response(response: str) -> dict:
    """Extract JSON object from AI response."""
    import re

    response = response.strip()
    try:
        data = json.loads(response)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    json_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', response)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    start = response.find('{')
    end = response.rfind('}')
    if start >= 0 and end > start:
        try:
            data = json.loads(response[start:end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    logger.warning("Could not parse JSON from AI response")
    return {}
