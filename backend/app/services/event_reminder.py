"""Event reminder scheduler.

Supports two modes:
1. Configurable reminders via `reminder_settings` JSONB on the event
2. Legacy fallback: single 2-hour window with `reminder_sent` flag
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)


def _time_label(minutes: int) -> str:
    if minutes >= 1440:
        d = minutes // 1440
        h = (minutes % 1440) // 60
        return f"{d}d {h}h" if h else f"{d}d"
    if minutes >= 60:
        return f"{minutes // 60}h {minutes % 60}m"
    return f"{minutes}m"


async def _process_configurable_reminders(
    db: AsyncSession, event: Event, now: datetime
) -> int:
    settings = event.reminder_settings or {}
    reminders = settings.get("reminders", [])
    if not reminders or not event.scheduled_at:
        return 0

    created = 0
    changed = False
    for reminder in reminders:
        if reminder.get("sent"):
            continue
        offset = reminder.get("offset_minutes", 0)
        trigger_at = event.scheduled_at - timedelta(minutes=offset)
        if trigger_at <= now:
            await create_notification(
                db,
                title=f"Starting in {_time_label(offset)}: {event.title}",
                notification_type="EVENT_REMINDER",
                recipient_type="INTERNAL",
                recipient_id=event.user_id,
                message=(
                    f"Your {event.event_type.replace('_', ' ')} is starting in {_time_label(offset)}."
                    + (f" Platform: {event.platform.replace('_', ' ').title()}" if event.platform else "")
                    + (f" | Meeting link: {event.meeting_link}" if event.meeting_link else "")
                ),
                related_entity_type="event",
                related_entity_id=event.id,
                sent_by="JARVIS",
            )
            reminder["sent"] = True
            changed = True
            created += 1

    if changed:
        from sqlalchemy import update as sa_update
        from app.models.event import Event as EventModel
        await db.execute(
            sa_update(EventModel)
            .where(EventModel.id == event.id)
            .values(reminder_settings=settings)
        )

    return created


async def check_upcoming_events(db: AsyncSession) -> int:
    """Scan events and create reminders. Returns count of new notifications."""
    now = datetime.now(timezone.utc)
    window = now + timedelta(hours=2)

    query = select(Event).where(
        and_(
            Event.scheduled_at.isnot(None),
            Event.scheduled_at >= now,
            or_(
                Event.reminder_settings.isnot(None),
                Event.reminder_sent == False,
            ),
        )
    )
    result = await db.execute(query)
    upcoming = result.scalars().all()

    created = 0
    for event in upcoming:
        if event.reminder_settings and event.reminder_settings.get("reminders"):
            created += await _process_configurable_reminders(db, event, now)
        elif not event.reminder_sent and event.scheduled_at <= window:
            delta = event.scheduled_at - now
            minutes_until = int(delta.total_seconds() / 60)
            time_label = _time_label(minutes_until)

            await create_notification(
                db,
                title=f"Starting in {time_label}: {event.title}",
                notification_type="EVENT_REMINDER",
                recipient_type="INTERNAL",
                recipient_id=event.user_id,
                message=(
                    f"Your {event.event_type.replace('_', ' ')} is starting in {time_label}."
                    + (f" Platform: {event.platform.replace('_', ' ').title()}" if event.platform else "")
                    + (f" | Meeting link: {event.meeting_link}" if event.meeting_link else "")
                ),
                related_entity_type="event",
                related_entity_id=event.id,
                sent_by="JARVIS",
            )
            event.reminder_sent = True
            created += 1

    await db.commit()
    logger.info("Event reminder check: %d reminders created (of %d upcoming)", created, len(upcoming))
    return created
