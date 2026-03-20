import json
import logging
import re
import ssl
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.ai.provider import get_ai_provider, get_model_for_tier

logger = logging.getLogger(__name__)

# Domains we recognize for source auto-detection
SOURCE_PATTERNS = {
    "linkedin.com": "linkedin",
    "indeed.com": "indeed",
    "glassdoor.com": "glassdoor",
}

SCRAPE_SYSTEM_PROMPT = (
    "You are a job listing parser. Given raw text extracted from a job listing web page, "
    "extract the structured job details. Return ONLY valid JSON with these fields:\n\n"
    '{\n'
    '  "title": "Job title (required)",\n'
    '  "company": "Company name (required)",\n'
    '  "location": "Location or Remote (optional, null if not found)",\n'
    '  "salary_range": "Salary range as stated (optional, null if not found)",\n'
    '  "job_type": "One of: full_time, part_time, contract, remote (optional, null if unclear)",\n'
    '  "description": "Full job description text",\n'
    '  "requirements": [\n'
    '    {"text": "Requirement text", "type": "required"},\n'
    '    {"text": "Nice to have item", "type": "preferred"}\n'
    '  ]\n'
    '}\n\n'
    "Rules:\n"
    "- Extract the ACTUAL content from the page, do not fabricate anything\n"
    "- For requirements, classify each as 'required', 'preferred', or 'nice_to_have'\n"
    "- If you cannot determine a field, set it to null\n"
    "- Return ONLY the JSON object, no markdown fencing, no explanation"
)

_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def detect_source(url: str) -> str:
    """Detect the job board source from the URL domain."""
    try:
        domain = urlparse(url).hostname or ""
        for pattern, source in SOURCE_PATTERNS.items():
            if pattern in domain:
                return source
    except Exception:
        pass
    return "company_site"


def _get_ssl_context() -> ssl.SSLContext | bool:
    """Build an SSL context that trusts the system certificate store.

    Corporate SSL-inspecting proxies (e.g. Zscaler) inject their own CA
    certificate.  The host OS trusts it, but Python inside Docker does not
    by default.  ``truststore`` (if installed) or ``certifi`` may not
    include the proxy CA.  We fall back to an unverified context only when
    the system store is unavailable.
    """
    try:
        import truststore  # noqa: F811
        ctx = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        return ctx
    except Exception:
        pass

    # Fallback: skip verification so scraping works behind corporate proxies.
    # This is acceptable because we only fetch public job-listing pages.
    return False


async def fetch_page_text(url: str) -> str:
    """Fetch a job listing page and extract visible text using httpx + BeautifulSoup."""
    async with httpx.AsyncClient(
        timeout=30,
        follow_redirects=True,
        headers=_HTTP_HEADERS,
        verify=_get_ssl_context(),
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove non-content elements
    for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Truncate to avoid exceeding AI context limits
    return text[:50000]


def _clean_json_response(raw: str) -> str:
    """Strip markdown fencing if the AI wrapped the JSON."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


async def extract_job_details(page_text: str) -> dict:
    """Use AI to extract structured job details from page text."""
    try:
        provider = get_ai_provider()
        model = get_model_for_tier("standard")
        raw = await provider.complete(
            system_prompt=SCRAPE_SYSTEM_PROMPT,
            user_prompt=f"Extract job details from this page content:\n\n{page_text}",
            model=model,
            temperature=0.1,
            max_tokens=4096,
        )
        cleaned = _clean_json_response(raw)
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error("AI returned invalid JSON for job extraction")
        return {}
    except Exception as e:
        logger.error("AI extraction failed: %s", str(e))
        return {}


async def scrape_job_url(url: str) -> dict:
    """Full pipeline: fetch page -> AI extract -> return structured data."""
    try:
        page_text = await fetch_page_text(url)
    except httpx.HTTPStatusError as e:
        return {"error": f"Could not access the page (HTTP {e.response.status_code})"}
    except Exception as e:
        logger.error("Page fetch failed: %s", str(e))
        return {"error": "Could not access the page. Check the URL and try again."}

    if not page_text or len(page_text.strip()) < 50:
        return {"error": "Could not extract content from the page"}

    details = await extract_job_details(page_text)
    if not details:
        return {"error": "Could not parse job details from the page"}

    source = detect_source(url)
    details["source"] = source
    details["url"] = url

    return details
