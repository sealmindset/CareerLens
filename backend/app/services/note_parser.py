"""JARVIS note parser -- extracts structured data from raw notes using AI."""

import json
import logging
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompt_loader import get_prompt, get_prompt_config
from app.ai.provider import get_ai_provider, get_model_for_tier

logger = logging.getLogger(__name__)

FALLBACK_PROMPT = (
    "You are JARVIS, an AI assistant for job seekers. You extract structured information "
    "from quick notes about job search interactions.\n\n"
    "Given a raw note, extract ALL of the following if present:\n"
    "- contact_name: The person's name\n"
    "- contact_email: Email if mentioned\n"
    "- role_title: Job title/position\n"
    "- company: Company name\n"
    "- location: Work location (look for city, state, 'Remote', etc.)\n"
    "- job_type: full_time, contract, part_time, remote\n"
    "- event_type: initial_call, phone_screen, technical_interview, "
    "behavioral_interview, panel_interview, follow_up, offer_call, other\n"
    "- scheduled_time: Date/time mentioned (ISO 8601 format)\n"
    "- timezone: Timezone mentioned or implied (default to CST if unclear)\n"
    "- platform: ms_teams, zoom, google_meet, phone, in_person, webex, other\n"
    "- duration_estimate: Contract duration or meeting duration if mentioned\n"
    "- contract_details: E.g. '9+ Month Contract', 'potential perm in 2027'\n"
    "- source: recruiter, referral, applied, etc.\n"
    "- additional_notes: Anything else relevant\n\n"
    "Return JSON only. Use null for fields not found. Include a confidence score "
    "(0-1) for each extracted field in a separate 'confidence' object."
)


async def parse_note(db: AsyncSession, raw_note: str) -> dict:
    """Parse a raw note into structured event data using AI.

    Returns a dict with extracted fields and confidence scores.
    """
    current_date = date.today().isoformat()

    system_prompt = await get_prompt(db, "jarvis-note-parser", FALLBACK_PROMPT)
    # Inject current date for relative date interpretation
    system_prompt = system_prompt.replace("{current_date}", current_date)

    temperature, max_tokens, model_tier = await get_prompt_config(
        db, "jarvis-note-parser"
    )

    user_prompt = f"Parse this note:\n\n{raw_note}"

    try:
        ai = get_ai_provider()
        model = get_model_for_tier(model_tier)
        raw = await ai.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # Strip markdown code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        parsed = json.loads(cleaned)
        return parsed

    except Exception as exc:
        logger.warning("AI note parse failed (%s), returning empty result", exc)
        return {
            "contact_name": None,
            "role_title": None,
            "company": None,
            "location": None,
            "job_type": None,
            "event_type": None,
            "scheduled_time": None,
            "timezone": None,
            "platform": None,
            "contract_details": None,
            "source": None,
            "additional_notes": None,
            "confidence": {},
            "error": str(exc),
        }
