"""Events router -- JARVIS Command Center API."""

import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.permissions import require_permission
from app.models.event import Event
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.event import (
    EventCreate,
    EventOut,
    EventUpdate,
    MeetingPrepResponse,
    NoteCreateRequest,
    NoteParseRequest,
    NoteParseResult,
)
from app.services.command_center import aggregate_prep, create_from_note
from app.services.note_parser import parse_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/events", tags=["events"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up the DB user id from the OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


def _enrich_event(event: Event) -> dict:
    """Add computed fields (job_title, job_company, countdown_display) to event."""
    data = {c.name: getattr(event, c.name) for c in event.__table__.columns}

    # Enrich from linked application -> job listing
    job_title = None
    job_company = None
    if event.application and event.application.job_listing:
        job_title = event.application.job_listing.title
        job_company = event.application.job_listing.company
    data["job_title"] = job_title
    data["job_company"] = job_company

    # Countdown display
    countdown = None
    if event.scheduled_at:
        now = datetime.now(timezone.utc)
        delta = event.scheduled_at - now
        total_seconds = int(delta.total_seconds())
        if total_seconds > 0:
            days = total_seconds // 86400
            hours = (total_seconds % 86400) // 3600
            minutes = (total_seconds % 3600) // 60
            if days > 0:
                countdown = f"{days}d {hours}h"
            elif hours > 0:
                countdown = f"{hours}h {minutes}m"
            else:
                countdown = f"{minutes}m"
        else:
            countdown = "Now"
    data["countdown_display"] = countdown

    return data


# ---- CRUD endpoints --------------------------------------------------------

@router.get("", response_model=list[EventOut])
async def list_events(
    upcoming: bool = Query(False, description="Only future events"),
    days: int = Query(30, description="Limit to next N days"),
    prep_status_filter: str | None = Query(None, alias="prep_status"),
    current_user: UserInfo = Depends(require_permission("events", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List events for the current user."""
    user_id = await _get_user_id(db, current_user)
    query = select(Event).where(Event.user_id == user_id)

    if upcoming:
        now = datetime.now(timezone.utc)
        query = query.where(Event.scheduled_at >= now)

    if prep_status_filter:
        query = query.where(Event.prep_status == prep_status_filter)

    query = query.order_by(Event.scheduled_at.asc().nullslast())
    result = await db.execute(query)
    events = result.scalars().all()
    return [_enrich_event(e) for e in events]


@router.get("/upcoming", response_model=list[EventOut])
async def upcoming_events(
    limit: int = Query(5, le=20),
    current_user: UserInfo = Depends(require_permission("events", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Next N upcoming events with countdown (for dashboard widget)."""
    user_id = await _get_user_id(db, current_user)
    now = datetime.now(timezone.utc)
    query = (
        select(Event)
        .where(Event.user_id == user_id, Event.scheduled_at >= now)
        .order_by(Event.scheduled_at.asc())
        .limit(limit)
    )
    result = await db.execute(query)
    events = result.scalars().all()
    return [_enrich_event(e) for e in events]


@router.get("/{event_id}", response_model=EventOut)
async def get_event(
    event_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("events", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single event by ID."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.user_id == user_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _enrich_event(event)


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    current_user: UserInfo = Depends(require_permission("events", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Manually create an event."""
    user_id = await _get_user_id(db, current_user)
    event = Event(user_id=user_id, **data.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event, ["application"])
    return _enrich_event(event)


@router.put("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    current_user: UserInfo = Depends(require_permission("events", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing event."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.user_id == user_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(event, field, value)

    await db.commit()
    await db.refresh(event, ["application"])
    return _enrich_event(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("events", "delete")),
    db: AsyncSession = Depends(get_db),
):
    """Delete an event."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.user_id == user_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    await db.delete(event)
    await db.commit()


# ---- JARVIS AI endpoints ---------------------------------------------------

@router.post("/parse-note", response_model=NoteParseResult)
async def parse_note_endpoint(
    data: NoteParseRequest,
    current_user: UserInfo = Depends(require_permission("events", "create")),
    db: AsyncSession = Depends(get_db),
):
    """AI parse a raw note — returns preview without saving anything."""
    parsed = await parse_note(db, data.raw_note)
    return NoteParseResult(**{
        k: parsed.get(k) for k in NoteParseResult.model_fields
    })


@router.post("/from-note", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_from_note_endpoint(
    data: NoteCreateRequest,
    current_user: UserInfo = Depends(require_permission("events", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Parse note + create job + application + event in one transaction."""
    user_id = await _get_user_id(db, current_user)
    event = await create_from_note(db, user_id, data.raw_note, data.overrides)
    return _enrich_event(event)


# ---- Meeting Prep endpoints ------------------------------------------------

@router.get("/{event_id}/prep", response_model=MeetingPrepResponse)
async def get_prep(
    event_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("events", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate all prep materials for an event."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.user_id == user_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    prep_data = await aggregate_prep(db, event)
    return MeetingPrepResponse(event=_enrich_event(event), **prep_data)


@router.post("/{event_id}/generate-prep", response_model=EventOut)
async def generate_prep(
    event_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("events", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Generate a Shift Gears briefing using AI and save as workspace artifact."""
    from app.ai.prompt_loader import get_prompt, get_prompt_config
    from app.ai.provider import get_ai_provider, get_model_for_tier
    from app.services.workspace_service import get_or_create_workspace, save_artifact

    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.user_id == user_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event.application_id:
        raise HTTPException(
            status_code=400,
            detail="Event must be linked to an application to generate prep",
        )

    # Collect context from existing prep materials
    prep_data = await aggregate_prep(db, event)

    # Build user prompt with all available context
    context_parts = []

    # Event details
    context_parts.append(f"## Event Details")
    context_parts.append(f"- Contact: {event.contact_name or 'Unknown'}")
    context_parts.append(f"- Company: {prep_data.get('job_company') or 'Unknown'}")
    context_parts.append(f"- Role: {prep_data.get('job_title') or 'Unknown'}")
    context_parts.append(f"- Platform: {(event.platform or 'TBD').replace('_', ' ').title()}")
    context_parts.append(f"- Duration: {event.duration_minutes} minutes")
    if event.scheduled_at:
        context_parts.append(f"- Time: {event.scheduled_at.strftime('%b %d, %Y %I:%M %p')} {event.timezone or ''}")

    # Existing artifacts
    if prep_data.get("match_analysis"):
        context_parts.append(f"\n## Scout Analysis\n{prep_data['match_analysis'][:2000]}")
    if prep_data.get("skill_gap_report"):
        context_parts.append(f"\n## Skill Gaps\n{prep_data['skill_gap_report'][:1000]}")
    if prep_data.get("company_brief"):
        context_parts.append(f"\n## Company Intel\n{prep_data['company_brief'][:2000]}")
    if prep_data.get("interview_prep_guide"):
        context_parts.append(f"\n## Interview Prep\n{prep_data['interview_prep_guide'][:2000]}")
    if prep_data.get("story_cheatsheet"):
        context_parts.append(f"\n## Story Cheatsheet\n{prep_data['story_cheatsheet'][:1500]}")

    # Stories
    if prep_data.get("relevant_stories"):
        context_parts.append("\n## Your Top Stories")
        for story in prep_data["relevant_stories"][:3]:
            context_parts.append(f"- {story.get('title', 'Untitled')}: {story.get('hook_line', '')}")

    user_prompt = "\n".join(context_parts)

    # Load and call AI
    fallback_prompt = (
        "Generate a concise pre-interview Shift Gears briefing. "
        "Keep it to a 2-minute read. Be punchy and motivating."
    )
    system_prompt = await get_prompt(db, "jarvis-shift-gears", fallback_prompt)
    temperature, max_tokens, model_tier = await get_prompt_config(db, "jarvis-shift-gears")

    try:
        ai = get_ai_provider()
        model = get_model_for_tier(model_tier)
        briefing = await ai.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        logger.warning("Shift Gears generation failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="AI service temporarily unavailable. Please try again.",
        )

    # Save as workspace artifact
    workspace = await get_or_create_workspace(db, event.application_id, user_id)
    await save_artifact(
        db,
        workspace_id=workspace.id,
        agent_name="jarvis",
        artifact_type="shift_gears_briefing",
        title=f"Shift Gears — {event.title}",
        content=briefing,
        content_format="markdown",
    )

    # Update prep status
    event.prep_status = "ready"
    await db.commit()
    await db.refresh(event, ["application"])
    return _enrich_event(event)
