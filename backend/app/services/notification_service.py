"""Notification query helpers and creation service (N02, N08)."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Select, and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


def build_notification_where(
    query: Select, user_id: uuid.UUID, role_name: str | None = None
) -> Select:
    """Scope notifications to those visible to the given user (N02).

    Internal users see:
      - Broadcast (recipient_type=INTERNAL, recipient_id=null)
      - Targeted (recipient_type=INTERNAL, recipient_id=user_id)
    """
    return query.where(
        and_(
            Notification.recipient_type == "INTERNAL",
            or_(
                Notification.recipient_id.is_(None),
                Notification.recipient_id == user_id,
            ),
        )
    )


def with_unread_filter(query: Select) -> Select:
    """Add unread constraint (read_at IS NULL)."""
    return query.where(Notification.read_at.is_(None))


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Fast unread count — single COUNT query, no joins."""
    query = select(func.count(Notification.id))
    query = build_notification_where(query, user_id)
    query = with_unread_filter(query)
    result = await db.execute(query)
    return result.scalar() or 0


async def mark_notifications_read(
    db: AsyncSession,
    user_id: uuid.UUID,
    notification_ids: list[uuid.UUID] | None = None,
    mark_all: bool = False,
) -> int:
    """Mark specific or all notifications as read. Returns count updated."""
    now = datetime.now(timezone.utc)

    base = (
        update(Notification)
        .where(
            and_(
                Notification.recipient_type == "INTERNAL",
                or_(
                    Notification.recipient_id.is_(None),
                    Notification.recipient_id == user_id,
                ),
                Notification.read_at.is_(None),
            )
        )
        .values(read_at=now, status="READ")
    )

    if not mark_all and notification_ids:
        base = base.where(Notification.id.in_(notification_ids))

    result = await db.execute(base)
    await db.commit()
    return result.rowcount  # type: ignore[return-value]


async def create_notification(
    db: AsyncSession,
    *,
    title: str,
    notification_type: str,
    recipient_type: str = "INTERNAL",
    recipient_id: uuid.UUID | None = None,
    message: str | None = None,
    related_entity_type: str | None = None,
    related_entity_id: uuid.UUID | None = None,
    sent_by: str | None = None,
) -> Notification:
    """Server-side notification creation (N08). Called by agents/services."""
    notif = Notification(
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        notification_type=notification_type,
        title=title,
        message=message,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        sent_by=sent_by,
        status="SENT",
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)
    return notif
