"""Quick Capture service — capture, AI-classify, extract tasks / delegate events."""

import json
import logging
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.prompt_loader import get_prompt, get_prompt_config
from app.ai.provider import get_ai_provider, get_model_for_tier
from app.models.quick_capture import QuickCapture
from app.models.task import Task
from app.services.command_center import create_from_note
from app.services.notification_service import create_notification
from app.services.task_service import create_task

logger = logging.getLogger(__name__)

FALLBACK_PROMPT = (
    "You are JARVIS, an AI assistant for job seekers. You analyze quick capture notes "
    "and extract actionable tasks.\n\n"
    "Given a raw note, determine its classification and extract tasks:\n\n"
    "## Classification\n"
    "Classify the note as ONE of:\n"
    "- **full_jd**: Contains a job description, job posting, or recruiter message with role "
    "details, responsibilities, requirements, or qualifications. This includes recruiter DMs "
    "from LinkedIn that contain a position overview and/or detailed requirements.\n"
    "- **event**: Contains a scheduled meeting, interview, or call with a specific time "
    "(but NOT a full job description — short notes about scheduling only)\n"
    "- **tasks**: Contains action items, to-dos, or follow-ups\n"
    "- **info**: General information with no actionable tasks\n\n"
    "IMPORTANT: If the note contains BOTH a job description AND scheduling info, "
    "classify as **full_jd** (not event). The JD is the primary content.\n\n"
    "## Task Extraction\n"
    "For each actionable item, extract:\n"
    "- title, priority (urgent/important/normal/low), due_date (YYYY-MM-DD), "
    "due_reason, application_hint (company name or null)\n\n"
    "## Structured Fields (for full_jd or event only)\n"
    "When classification is **full_jd** or **event**, also extract these fields "
    "into a top-level \"structured\" object:\n"
    "- contact_name, contact_email, role_title, company, location, job_type, "
    "event_type, scheduled_time (ISO 8601), timezone, platform, duration_estimate, "
    "contract_details, source, salary_range, additional_notes\n"
    "- For full_jd: also include \"description\" (the cleaned JD text, excluding "
    "requirements) and \"requirements\" (array of {\"text\": \"...\", \"type\": "
    "\"required\"|\"preferred\"|\"nice_to_have\"})\n"
    "- Set input_mode to 'full_jd' or 'quick_note' as appropriate\n"
    "- Use null for fields not found\n\n"
    "Return JSON only:\n"
    '{"classification": "full_jd"|"event"|"tasks"|"info", "summary": "...", '
    '"tasks": [...], "structured": {...} | null}'
)


async def create_capture(
    db: AsyncSession,
    user_id: uuid.UUID,
    raw_text: str,
) -> QuickCapture:
    """Create a new quick capture entry."""
    capture = QuickCapture(
        user_id=user_id,
        raw_text=raw_text,
    )
    db.add(capture)
    await db.flush()
    await db.refresh(capture)
    return capture


async def process_capture(
    db: AsyncSession,
    user_id: uuid.UUID,
    capture: QuickCapture,
) -> dict:
    """Classify a capture with AI, extract tasks, and optionally create an event.

    Returns a dict matching QuickCaptureProcessResult schema.
    """
    # 1. Call AI to classify + extract tasks
    current_date = date.today().isoformat()
    system_prompt = await get_prompt(db, "jarvis-task-extractor", FALLBACK_PROMPT)
    system_prompt = system_prompt.replace("{current_date}", current_date)

    temperature, max_tokens, model_tier = await get_prompt_config(
        db, "jarvis-task-extractor"
    )

    user_prompt = f"Analyze this note:\n\n{capture.raw_text}"

    classification = "info"
    summary = None
    extracted_tasks_raw: list[dict] = []

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

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        parsed = json.loads(cleaned)
        classification = parsed.get("classification", "info")
        summary = parsed.get("summary")
        extracted_tasks_raw = parsed.get("tasks", [])
        structured_fields = parsed.get("structured")
    except Exception as exc:
        logger.warning("AI capture processing failed (%s), marking as info", exc)
        summary = capture.raw_text[:200]
        structured_fields = None

    # 2. Create Task records from extracted tasks
    tasks_created: list[Task] = []
    for task_data in extracted_tasks_raw:
        due_date_val = None
        if task_data.get("due_date"):
            try:
                due_date_val = date.fromisoformat(task_data["due_date"])
            except (ValueError, TypeError):
                pass

        task = await create_task(
            db,
            user_id=user_id,
            title=task_data.get("title", "Untitled task"),
            priority=task_data.get("priority", "normal"),
            due_date=due_date_val,
            due_reason=task_data.get("due_reason"),
            source_type="jarvis",
            source_id=capture.id,
        )
        tasks_created.append(task)

    # 3. If classified as event or full_jd, delegate to command_center
    #    Also apply a heuristic: long notes (>500 chars) with JD-like keywords
    #    should always go through create_from_note() even if AI misclassifies.
    event_created = None
    should_create_event = classification in ("event", "full_jd")
    if not should_create_event and len(capture.raw_text) > 500:
        jd_signals = [
            "responsibilities", "requirements", "qualifications",
            "about the role", "job description", "position overview",
            "must have", "nice to have", "years of experience",
        ]
        text_lower = capture.raw_text.lower()
        if sum(1 for s in jd_signals if s in text_lower) >= 2:
            should_create_event = True
            classification = "full_jd"
            logger.info("Overriding classification to full_jd (heuristic match)")

    if should_create_event:
        try:
            event_created = await create_from_note(
                db, user_id, capture.raw_text,
                overrides=structured_fields if isinstance(structured_fields, dict) else None,
            )
        except Exception as exc:
            logger.warning("Event creation from capture failed: %s", exc)

    # 4. Mark capture as processed
    capture.processed = True
    capture.processed_at = datetime.now(timezone.utc)
    capture.ai_summary = summary
    capture.extracted_tasks = {
        "classification": classification,
        "tasks": [{"title": t.title, "priority": t.priority} for t in tasks_created],
    }
    if event_created:
        capture.related_entity_type = "event"
        capture.related_entity_id = event_created.id
    elif tasks_created:
        capture.related_entity_type = "task"
        capture.related_entity_id = tasks_created[0].id

    await db.flush()
    await db.refresh(capture)

    # 5. Notify user
    if event_created and classification == "full_jd":
        await create_notification(
            db,
            title="JARVIS processed a full job description",
            notification_type="STATUS_CHANGE",
            recipient_id=user_id,
            message=(
                f"Job listing, application, and event created. "
                f"{'Also extracted ' + str(len(tasks_created)) + ' task(s). ' if tasks_created else ''}"
                f"Head to Application Studio to run Scout and Tailor."
            ),
            related_entity_type="quick_capture",
            related_entity_id=capture.id,
            sent_by="JARVIS",
        )
    elif tasks_created:
        await create_notification(
            db,
            title=f"JARVIS extracted {len(tasks_created)} task(s) from your note",
            notification_type="STATUS_CHANGE",
            recipient_id=user_id,
            message=summary,
            related_entity_type="quick_capture",
            related_entity_id=capture.id,
            sent_by="JARVIS",
        )

    await db.commit()
    await db.refresh(capture)

    return {
        "capture": capture,
        "classification": classification,
        "tasks_created": tasks_created,
        "event_created": event_created,
        "summary": summary,
    }


async def list_captures(
    db: AsyncSession,
    user_id: uuid.UUID,
    processed: bool | None = None,
) -> list[QuickCapture]:
    """List captures for a user, optionally filtered by processed state."""
    query = select(QuickCapture).where(QuickCapture.user_id == user_id)
    if processed is not None:
        query = query.where(QuickCapture.processed == processed)
    query = query.order_by(QuickCapture.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())
