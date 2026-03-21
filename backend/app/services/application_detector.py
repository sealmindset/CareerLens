"""Application method detector -- identifies how an employer accepts applications.

Two-phase detection:
1. Domain-based quick lookup (known ATS platforms, chatbot providers)
2. AI-powered page analysis via Playwright (classifies unknown pages)

Stores the detected method on the JobListing for use by the Auto-Fill agent.
"""

import json
import logging
import re
from dataclasses import dataclass
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# ─── Application method types ───────────────────────────────────────────────

APPLICATION_METHODS = {
    "form": "Traditional web form (Workday, Greenhouse, Lever, iCIMS, Taleo, etc.)",
    "chatbot": "Conversational AI chatbot (Paradox.ai/Olivia, Mya, etc.)",
    "email": "Email-based application (send resume to an address)",
    "redirect": "External portal redirect (click to apply on another site)",
    "api_portal": "ATS portal requiring login (Workday, SuccessFactors, etc.)",
    "unknown": "Could not determine application method",
}


@dataclass
class DetectionResult:
    """Result of application method detection."""
    method: str  # key from APPLICATION_METHODS
    confidence: str  # "high", "medium", "low"
    platform: str  # e.g., "paradox.ai", "workday", "greenhouse"
    details: str  # human-readable explanation
    apply_url: str | None = None  # resolved application URL if different from job URL


# ─── Phase 1: Domain-based quick detection ──────────────────────────────────

DOMAIN_RULES: list[tuple[list[str], str, str]] = [
    # (domain_patterns, method, platform)

    # Chatbot platforms
    (["paradox.ai", "olivia.paradox.ai"], "chatbot", "paradox.ai"),
    (["mya.com", "chat.mya.com"], "chatbot", "mya"),
    (["humanly.io"], "chatbot", "humanly"),
    (["wade.ai", "wadewenzel"], "chatbot", "wade_and_wendy"),

    # ATS portals (login-gated form flows)
    (["myworkdayjobs.com", "myworkday.com", "wd5.myworkdayjobs.com", "wd1.myworkdayjobs.com"], "api_portal", "workday"),
    (["successfactors.com", "successfactors.eu"], "api_portal", "successfactors"),
    (["taleo.net", "oracle.taleo.net"], "api_portal", "taleo"),
    (["icims.com", "careers-"], "api_portal", "icims"),
    (["brassring.com"], "api_portal", "brassring"),
    (["ultipro.com", "recruiting.ultipro.com"], "api_portal", "ultipro"),

    # ATS with embeddable forms (usually accessible without login)
    (["greenhouse.io", "boards.greenhouse.io"], "form", "greenhouse"),
    (["lever.co", "jobs.lever.co"], "form", "lever"),
    (["ashbyhq.com", "jobs.ashbyhq.com"], "form", "ashby"),
    (["bamboohr.com", "*.bamboohr.com"], "form", "bamboohr"),
    (["jobvite.com", "jobs.jobvite.com"], "form", "jobvite"),
    (["smartrecruiters.com"], "form", "smartrecruiters"),
    (["recruitee.com"], "form", "recruitee"),
    (["applytojob.com"], "form", "jazz_hr"),
    (["breezy.hr"], "form", "breezy"),

    # Job boards (redirect to employer)
    (["linkedin.com/jobs"], "redirect", "linkedin"),
    (["indeed.com/viewjob", "indeed.com/rc"], "redirect", "indeed"),
    (["glassdoor.com/job-listing"], "redirect", "glassdoor"),
    (["ziprecruiter.com/jobs"], "redirect", "ziprecruiter"),
]


def detect_by_domain(url: str) -> DetectionResult | None:
    """Phase 1: Quick detection based on URL domain patterns."""
    try:
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        full_url = url.lower()
    except Exception:
        return None

    for patterns, method, platform in DOMAIN_RULES:
        for pattern in patterns:
            if pattern in hostname or pattern in full_url:
                return DetectionResult(
                    method=method,
                    confidence="high",
                    platform=platform,
                    details=f"Detected {platform} ({APPLICATION_METHODS[method]})",
                )

    return None


# ─── Phase 2: AI-powered page analysis ─────────────────────────────────────

DETECTION_SYSTEM_PROMPT = """You are an expert at classifying job application submission methods.

Given the text content and DOM structure of a job listing page, determine HOW a candidate submits their application.

Classify into exactly ONE of these categories:

1. **form** — The page contains or links to a traditional web form with input fields (name, email, resume upload, etc.). Common on Greenhouse, Lever, BambooHR, custom career pages.

2. **chatbot** — The page uses a conversational AI chatbot widget (like Paradox.ai/Olivia, Mya, or similar). Look for: chat bubbles, "powered by Paradox/Olivia", conversational UI, chat composer/input at bottom. The chatbot asks questions sequentially.

3. **email** — The page instructs candidates to email their resume/application. Look for: "send your resume to careers@...", "email us at...", mailto: links.

4. **redirect** — The page is a job board listing (LinkedIn, Indeed, Glassdoor) that redirects to the employer's own application portal. Look for: "Apply on company website", "External apply", redirect buttons.

5. **api_portal** — The page requires creating an account or logging into an ATS portal (Workday, SuccessFactors, Taleo, iCIMS) before you can apply. Look for: login forms, "create account to apply", "sign in to continue", multi-step wizard behind auth.

6. **unknown** — Cannot determine the method from the available content.

Return ONLY valid JSON:
{
  "method": "form|chatbot|email|redirect|api_portal|unknown",
  "confidence": "high|medium|low",
  "platform": "name of the platform if identifiable (e.g., 'greenhouse', 'paradox.ai', 'workday'), or 'custom' if not a known platform",
  "details": "Brief explanation of why you classified it this way",
  "apply_url": "The actual application URL if different from the page URL (e.g., an 'Apply Now' button href), or null"
}"""


async def detect_by_page_analysis(url: str) -> DetectionResult:
    """Phase 2: Use Playwright + AI to analyze the actual page content."""
    page_data = await _fetch_page_signals(url)

    if page_data.get("error"):
        return DetectionResult(
            method="unknown",
            confidence="low",
            platform="unknown",
            details=f"Could not analyze page: {page_data['error']}",
        )

    # Build analysis prompt from page signals
    analysis_input = _build_analysis_prompt(url, page_data)

    try:
        from app.ai.provider import get_ai_provider, get_model_for_tier

        provider = get_ai_provider()
        model = get_model_for_tier("light")
        raw = await provider.complete(
            system_prompt=DETECTION_SYSTEM_PROMPT,
            user_prompt=analysis_input,
            model=model,
            temperature=0.1,
            max_tokens=500,
        )

        # Parse AI response
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        data = json.loads(cleaned)
        return DetectionResult(
            method=data.get("method", "unknown"),
            confidence=data.get("confidence", "low"),
            platform=data.get("platform", "unknown"),
            details=data.get("details", ""),
            apply_url=data.get("apply_url"),
        )

    except Exception as e:
        logger.error("AI page analysis failed: %s", str(e))
        return DetectionResult(
            method="unknown",
            confidence="low",
            platform="unknown",
            details=f"AI analysis failed: {str(e)[:100]}",
        )


async def _fetch_page_signals(url: str) -> dict:
    """Use Playwright to visit the page and extract classification signals."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {"error": "Playwright is not installed"}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            ctx = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                ignore_https_errors=True,
            )
            page = await ctx.new_page()
            await page.goto(url, wait_until="networkidle", timeout=30000)

            signals = await page.evaluate("""() => {
                const result = {
                    title: document.title,
                    text_sample: '',
                    has_form: false,
                    form_field_count: 0,
                    has_chat_widget: false,
                    has_file_upload: false,
                    has_login_form: false,
                    has_email_link: false,
                    email_addresses: [],
                    apply_buttons: [],
                    external_links: [],
                    chat_indicators: [],
                    ats_indicators: [],
                    iframes: [],
                };

                // Text sample (first 3000 chars of visible text)
                result.text_sample = document.body?.innerText?.substring(0, 3000) || '';

                // Form detection
                const forms = document.querySelectorAll('form');
                result.has_form = forms.length > 0;
                const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
                result.form_field_count = inputs.length;

                // File upload
                result.has_file_upload = document.querySelectorAll('input[type="file"]').length > 0;

                // Login form indicators
                const passwordFields = document.querySelectorAll('input[type="password"]');
                const loginText = document.body?.innerText?.toLowerCase() || '';
                result.has_login_form = passwordFields.length > 0 ||
                    loginText.includes('sign in to apply') ||
                    loginText.includes('create account') ||
                    loginText.includes('log in to continue');

                // Chat widget indicators
                const chatSelectors = [
                    '.olivia-msg-bubble', '#widget_composer_input',
                    '[class*="chat-widget"]', '[class*="chatbot"]',
                    '[id*="paradox"]', '[id*="olivia"]',
                    '.me-messages', '[class*="messenger"]',
                ];
                for (const sel of chatSelectors) {
                    if (document.querySelector(sel)) {
                        result.has_chat_widget = true;
                        result.chat_indicators.push(sel);
                    }
                }

                // Check for chat-related scripts
                const scripts = document.querySelectorAll('script[src]');
                for (const s of scripts) {
                    const src = s.getAttribute('src') || '';
                    if (src.includes('paradox') || src.includes('olivia') ||
                        src.includes('mya.com') || src.includes('chatbot')) {
                        result.chat_indicators.push('script: ' + src.substring(0, 100));
                    }
                }

                // Email detection
                const links = document.querySelectorAll('a[href^="mailto:"]');
                for (const l of links) {
                    const email = l.getAttribute('href').replace('mailto:', '').split('?')[0];
                    result.email_addresses.push(email);
                }
                result.has_email_link = result.email_addresses.length > 0;

                // Apply buttons
                const buttons = document.querySelectorAll('a, button');
                for (const b of buttons) {
                    const text = b.textContent?.trim()?.toLowerCase() || '';
                    if (text.includes('apply') || text.includes('submit application')) {
                        const href = b.getAttribute('href') || '';
                        result.apply_buttons.push({
                            text: b.textContent?.trim()?.substring(0, 50),
                            href: href.substring(0, 200),
                            is_external: href.startsWith('http') && !href.includes(window.location.hostname),
                        });
                    }
                }

                // ATS platform indicators
                const html = document.documentElement.outerHTML.substring(0, 10000).toLowerCase();
                const atsPatterns = ['workday', 'greenhouse', 'lever.co', 'icims',
                    'taleo', 'successfactors', 'bamboohr', 'ashby', 'jobvite',
                    'smartrecruiters', 'paradox', 'olivia'];
                for (const p of atsPatterns) {
                    if (html.includes(p)) result.ats_indicators.push(p);
                }

                // Iframes (some ATS embed forms in iframes)
                const iframeEls = document.querySelectorAll('iframe');
                for (const f of iframeEls) {
                    const src = f.getAttribute('src') || '';
                    if (src) result.iframes.push(src.substring(0, 200));
                }

                return result;
            }""")

            await browser.close()
            return signals

    except Exception as e:
        logger.error("Page signal extraction failed for %s: %s", url, str(e))
        return {"error": str(e)[:200]}


def _build_analysis_prompt(url: str, signals: dict) -> str:
    """Build the AI analysis prompt from extracted page signals."""
    lines = [
        f"## Page Analysis for: {url}",
        f"**Title:** {signals.get('title', 'N/A')}",
        "",
        f"**Has form elements:** {signals.get('has_form', False)} ({signals.get('form_field_count', 0)} fields)",
        f"**Has file upload:** {signals.get('has_file_upload', False)}",
        f"**Has chat widget:** {signals.get('has_chat_widget', False)}",
        f"**Has login form:** {signals.get('has_login_form', False)}",
        f"**Has email links:** {signals.get('has_email_link', False)}",
    ]

    if signals.get("chat_indicators"):
        lines.append(f"**Chat indicators:** {', '.join(signals['chat_indicators'][:5])}")

    if signals.get("ats_indicators"):
        lines.append(f"**ATS platforms detected:** {', '.join(signals['ats_indicators'][:5])}")

    if signals.get("email_addresses"):
        lines.append(f"**Email addresses found:** {', '.join(signals['email_addresses'][:3])}")

    if signals.get("apply_buttons"):
        lines.append("**Apply buttons:**")
        for btn in signals["apply_buttons"][:5]:
            ext = " (EXTERNAL)" if btn.get("is_external") else ""
            lines.append(f"  - \"{btn['text']}\" → {btn.get('href', 'no href')}{ext}")

    if signals.get("iframes"):
        lines.append(f"**Iframes:** {', '.join(signals['iframes'][:3])}")

    lines.append("")
    lines.append("**Page text (first 2000 chars):**")
    text = signals.get("text_sample", "")[:2000]
    lines.append(text)

    return "\n".join(lines)


# ─── Public API ─────────────────────────────────────────────────────────────


async def detect_application_method(url: str, use_ai: bool = True) -> DetectionResult:
    """Detect the application submission method for a job URL.

    Phase 1: Domain-based quick lookup (instant, high confidence for known platforms)
    Phase 2: Playwright page analysis + AI classification (if Phase 1 inconclusive)
    """
    if not url:
        return DetectionResult(
            method="unknown", confidence="low", platform="unknown",
            details="No URL provided",
        )

    # Phase 1: Domain lookup
    domain_result = detect_by_domain(url)
    if domain_result and domain_result.confidence == "high":
        logger.info("Application detection (domain): %s -> %s (%s)",
                     url[:80], domain_result.method, domain_result.platform)
        return domain_result

    if not use_ai:
        return domain_result or DetectionResult(
            method="unknown", confidence="low", platform="unknown",
            details="Domain not recognized and AI analysis disabled",
        )

    # Phase 2: AI-powered page analysis
    logger.info("Application detection (AI): analyzing page %s", url[:80])
    ai_result = await detect_by_page_analysis(url)

    # If domain gave a partial match, merge with AI result
    if domain_result and ai_result.confidence == "low":
        return domain_result

    logger.info("Application detection (AI): %s -> %s (%s, %s)",
                 url[:80], ai_result.method, ai_result.platform, ai_result.confidence)
    return ai_result
