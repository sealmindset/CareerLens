"""JARVIS Command Center -- orchestrates note-to-event creation and prep aggregation."""

import logging
import uuid
from datetime import datetime, timezone

from dateutil import parser as dateparser
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application
from app.models.event import Event
from app.models.job import JobListing, JobRequirement
from app.models.workspace import AgentWorkspace, WorkspaceArtifact
from app.services.note_parser import parse_note
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)

# Maps parsed platform strings to the DB enum values
PLATFORM_MAP = {
    "ms teams": "ms_teams",
    "microsoft teams": "ms_teams",
    "teams": "ms_teams",
    "zoom": "zoom",
    "google meet": "google_meet",
    "phone": "phone",
    "in person": "in_person",
    "in-person": "in_person",
    "webex": "webex",
}

# Maps parsed event type strings to the DB enum values
EVENT_TYPE_MAP = {
    "initial_call": "initial_call",
    "initial call": "initial_call",
    "phone_screen": "phone_screen",
    "phone screen": "phone_screen",
    "technical_interview": "technical_interview",
    "technical interview": "technical_interview",
    "behavioral_interview": "behavioral_interview",
    "behavioral interview": "behavioral_interview",
    "panel_interview": "panel_interview",
    "panel interview": "panel_interview",
    "follow_up": "follow_up",
    "follow up": "follow_up",
    "offer_call": "offer_call",
    "offer call": "offer_call",
}


async def create_from_note(
    db: AsyncSession,
    user_id: uuid.UUID,
    raw_note: str,
    overrides: dict | None = None,
) -> Event:
    """Parse a raw note, find/create job + application, create event.

    Returns the created Event with relationships loaded.
    """
    # 1. Parse note — skip AI call if overrides already contain key fields
    if overrides and overrides.get("company") and overrides.get("role_title"):
        parsed = dict(overrides)
    else:
        parsed = await parse_note(db, raw_note)
        if overrides:
            for key, value in overrides.items():
                if value is not None:
                    parsed[key] = value

    company = parsed.get("company") or "Unknown Company"
    role_title = parsed.get("role_title") or "Untitled Role"
    contact_name = parsed.get("contact_name")
    source = parsed.get("source") or "recruiter"

    # 2. Find or create JobListing (fuzzy match on company + title)
    job_result = await db.execute(
        select(JobListing).where(
            JobListing.user_id == user_id,
            JobListing.company.ilike(f"%{company}%"),
            JobListing.title.ilike(f"%{role_title}%"),
        )
    )
    job = job_result.scalars().first()

    if not job:
        job = JobListing(
            user_id=user_id,
            title=role_title,
            company=company,
            location=parsed.get("location"),
            description=parsed.get("description"),
            salary_range=parsed.get("salary_range"),
            job_type=parsed.get("job_type"),
            source=source if source in (
                "linkedin", "indeed", "glassdoor", "company_site",
                "manual", "recruiter", "referral",
            ) else "recruiter",
            status="new",
            notes=parsed.get("contract_details"),
        )
        db.add(job)
        await db.flush()
        await db.refresh(job)

        # Create JobRequirement rows if full JD was parsed
        requirements_list = parsed.get("requirements") or []
        for req in requirements_list:
            if isinstance(req, dict) and req.get("text"):
                req_type = req.get("type", "required")
                if req_type not in ("required", "preferred", "nice_to_have"):
                    req_type = "required"
                db.add(JobRequirement(
                    job_listing_id=job.id,
                    requirement_text=req["text"],
                    requirement_type=req_type,
                ))
        if requirements_list:
            await db.flush()

    # 3. Find or create Application
    app_result = await db.execute(
        select(Application).where(
            Application.user_id == user_id,
            Application.job_listing_id == job.id,
        )
    )
    application = app_result.scalars().first()

    if not application:
        application = Application(
            user_id=user_id,
            job_listing_id=job.id,
            status="interviewing",
        )
        db.add(application)
        await db.flush()
        await db.refresh(application)

    # 4. Parse scheduled time
    scheduled_at = None
    if parsed.get("scheduled_time"):
        try:
            scheduled_at = dateparser.parse(parsed["scheduled_time"])
            if scheduled_at and scheduled_at.tzinfo is None:
                scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            logger.warning("Could not parse scheduled_time: %s", parsed.get("scheduled_time"))

    # 5. Normalize platform
    raw_platform = (parsed.get("platform") or "").lower().strip()
    platform = PLATFORM_MAP.get(raw_platform, raw_platform if raw_platform in (
        "ms_teams", "zoom", "google_meet", "phone", "in_person", "webex", "other"
    ) else None)

    # 6. Normalize event type
    raw_event_type = (parsed.get("event_type") or "initial_call").lower().strip()
    event_type = EVENT_TYPE_MAP.get(raw_event_type, "initial_call")

    # 7. Build title
    title = f"{event_type.replace('_', ' ').title()} — {role_title} at {company}"
    if contact_name:
        title += f" with {contact_name}"

    # 8. Create Event
    event = Event(
        user_id=user_id,
        application_id=application.id,
        event_type=event_type,
        title=title,
        scheduled_at=scheduled_at,
        timezone=parsed.get("timezone"),
        duration_minutes=int(parsed.get("duration_estimate") or 30) if str(parsed.get("duration_estimate", "")).isdigit() else 30,
        contact_name=contact_name,
        contact_email=parsed.get("contact_email"),
        platform=platform,
        raw_note=raw_note,
        parsed_data=parsed,
        notes=parsed.get("additional_notes"),
    )
    db.add(event)
    await db.flush()
    await db.refresh(event, ["application"])

    # 9. Create notification
    req_count = len(parsed.get("requirements") or [])
    is_full_jd = parsed.get("input_mode") == "full_jd"
    if is_full_jd and req_count:
        notify_msg = (
            f"JARVIS created a job listing with {req_count} requirements, "
            f"application, and event for {role_title} at {company}."
        )
    else:
        notify_msg = (
            f"JARVIS created an event from your note: {event_type.replace('_', ' ').title()} "
            f"for {role_title} at {company}."
        )
    if scheduled_at:
        notify_msg += f" Scheduled: {scheduled_at.strftime('%b %d, %Y %I:%M %p')}"

    await create_notification(
        db,
        title=f"Event created: {role_title} at {company}",
        notification_type="STATUS_CHANGE",
        recipient_type="INTERNAL",
        recipient_id=user_id,
        message=notify_msg,
        related_entity_type="event",
        related_entity_id=event.id,
        sent_by="JARVIS",
    )

    await db.commit()
    await db.refresh(event, ["application"])
    return event


async def aggregate_prep(
    db: AsyncSession,
    event: Event,
) -> dict:
    """Aggregate all meeting prep materials for an event.

    Collects artifacts from the linked application's workspace plus
    story bank stories.
    """
    result: dict = {
        "match_analysis": None,
        "skill_gap_report": None,
        "company_brief": None,
        "culture_analysis": None,
        "interview_prep_guide": None,
        "star_responses": None,
        "recruiter_screen_guide": None,
        "story_cheatsheet": None,
        "relevant_stories": [],
        "shift_gears_briefing": None,
        "prep_completeness": 0,
        "missing_sections": [],
    }

    if not event.application_id:
        result["missing_sections"] = [
            "match_analysis", "company_brief", "interview_prep_guide",
            "star_responses", "story_cheatsheet",
        ]
        return result

    # Find workspace for this application
    ws_result = await db.execute(
        select(AgentWorkspace).where(AgentWorkspace.application_id == event.application_id)
    )
    workspace = ws_result.scalars().first()

    if not workspace:
        result["missing_sections"] = [
            "match_analysis", "company_brief", "interview_prep_guide",
            "star_responses", "story_cheatsheet",
        ]
        return result

    # Load all artifacts for this workspace
    artifacts_result = await db.execute(
        select(WorkspaceArtifact)
        .where(WorkspaceArtifact.workspace_id == workspace.id)
        .order_by(WorkspaceArtifact.version.desc())
    )
    artifacts = artifacts_result.scalars().all()

    # Map artifact_type -> content (latest version only)
    artifact_map: dict[str, str] = {}
    for artifact in artifacts:
        if artifact.artifact_type not in artifact_map:
            artifact_map[artifact.artifact_type] = artifact.content

    # Map artifact types to prep response fields
    FIELD_MAP = {
        "job_match_analysis": "match_analysis",
        "skill_gap_report": "skill_gap_report",
        "company_brief": "company_brief",
        "culture_analysis": "culture_analysis",
        "interview_prep_guide": "interview_prep_guide",
        "star_responses": "star_responses",
        "recruiter_screen_guide": "recruiter_screen_guide",
        "story_cheatsheet": "story_cheatsheet",
        "shift_gears_briefing": "shift_gears_briefing",
    }

    sections_present = 0
    total_sections = len(FIELD_MAP)

    for artifact_type, field_name in FIELD_MAP.items():
        content = artifact_map.get(artifact_type)
        if content:
            result[field_name] = content
            sections_present += 1
        else:
            result["missing_sections"].append(field_name)

    # Load relevant stories from Story Bank
    try:
        from app.models.story_bank import StoryBankStory  # noqa: avoid circular import

        stories_result = await db.execute(
            select(StoryBankStory)
            .where(StoryBankStory.user_id == event.user_id)
            .order_by(StoryBankStory.times_used.desc())
            .limit(5)
        )
        stories = stories_result.scalars().all()
        result["relevant_stories"] = [
            {
                "id": str(s.id),
                "title": s.title,
                "hook_line": (s.content[:150] + "...") if s.content and len(s.content) > 150 else s.content,
                "tags": s.tags if hasattr(s, "tags") else [],
            }
            for s in stories
        ]
    except Exception:
        logger.debug("Story bank not available for prep aggregation")

    result["prep_completeness"] = int((sections_present / total_sections) * 100) if total_sections > 0 else 0

    return result
