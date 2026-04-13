"""Application follow-up reminder scheduler.

Checks daily for applications with follow_up_date <= today and creates
FOLLOW_UP_DUE notifications for the owning user.  Deduplicates so the same
application is only notified once per follow-up date.
"""

import logging
from datetime import date, datetime, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application
from app.models.notification import Notification
from app.services.notification_service import create_notification

logger = logging.getLogger(__name__)


async def check_follow_ups(db: AsyncSession) -> int:
    """Scan applications with due follow-ups and create notifications.

    Returns the number of new notifications created.
    """
    today = date.today()

    # Applications where follow_up_date is today or in the past
    query = select(Application).where(
        and_(
            Application.follow_up_date.isnot(None),
            Application.follow_up_date <= today,
            # Only active statuses — don't nag about closed apps
            Application.status.in_(
                ["submitted", "interviewing", "ready_to_review"]
            ),
        )
    )
    result = await db.execute(query)
    candidates = result.scalars().all()

    created = 0
    for app in candidates:
        # Dedup: skip if a FOLLOW_UP_DUE notification already exists for this
        # application on this follow-up date (or later)
        existing = await db.execute(
            select(func.count(Notification.id)).where(
                and_(
                    Notification.notification_type == "FOLLOW_UP_DUE",
                    Notification.related_entity_type == "application",
                    Notification.related_entity_id == app.id,
                    Notification.sent_at >= datetime(
                        app.follow_up_date.year,
                        app.follow_up_date.month,
                        app.follow_up_date.day,
                        tzinfo=timezone.utc,
                    ),
                )
            )
        )
        if (existing.scalar() or 0) > 0:
            continue

        # Build a meaningful title using the job relationship
        job = app.job_listing
        title_parts = []
        if job:
            if job.title:
                title_parts.append(job.title)
            if job.company:
                title_parts.append(f"at {job.company}")
        job_label = " ".join(title_parts) if title_parts else "an application"

        overdue_days = (today - app.follow_up_date).days
        if overdue_days == 0:
            urgency = "Follow-up due today"
        else:
            urgency = f"Follow-up overdue by {overdue_days} day{'s' if overdue_days != 1 else ''}"

        await create_notification(
            db,
            title=f"{urgency}: {job_label}",
            notification_type="FOLLOW_UP_DUE",
            recipient_type="INTERNAL",
            recipient_id=app.user_id,
            message=(
                f"Your follow-up for {job_label} was scheduled for "
                f"{app.follow_up_date.isoformat()}. "
                f"Status: {app.status.replace('_', ' ').title()}."
            ),
            related_entity_type="application",
            related_entity_id=app.id,
            sent_by="scheduler",
        )
        created += 1

    logger.info("Follow-up check: %d reminders created (of %d candidates)", created, len(candidates))
    return created
