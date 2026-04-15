"""Event reminder scheduler.

Checks for events where scheduled_at is within 2 hours and
reminder_sent=False. Creates EVENT_REMINDER notifications.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)


async def check_upcoming_events(db: AsyncSession) -> int:
    """Scan events happening within 2 hours and create reminders.

    Returns the number of new notifications created.
    """
    now = datetime.now(timezone.utc)
    window = now + timedelta(hours=2)

    query = select(Event).where(
        and_(
            Event.scheduled_at.isnot(None),
            Event.scheduled_at >= now,
            Event.scheduled_at <= window,
            Event.reminder_sent == False,
        )
    )
    result = await db.execute(query)
    upcoming = result.scalars().all()

    created = 0
    for event in upcoming:
        # Calculate time until event
        delta = event.scheduled_at - now
        minutes_until = int(delta.total_seconds() / 60)
        if minutes_until > 60:
            time_label = f"{minutes_until // 60}h {minutes_until % 60}m"
        else:
            time_label = f"{minutes_until}m"

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

        # Mark reminder as sent
        event.reminder_sent = True
        created += 1

    await db.commit()
    logger.info("Event reminder check: %d reminders created (of %d upcoming)", created, len(upcoming))
    return created
