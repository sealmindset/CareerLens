"""Notification REST API (N03)."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.notification import (
    NotificationCountResponse,
    NotificationListResponse,
    NotificationMarkReadRequest,
    NotificationMarkReadResponse,
    NotificationOut,
)
from app.services.notification_service import (
    build_notification_where,
    get_unread_count,
    mark_notifications_read,
    with_unread_filter,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up DB user id from OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    status_filter: str | None = Query(None, alias="status", description="UNREAD to filter unread only"),
    limit: int = Query(20, le=50),
    offset: int = Query(0, ge=0),
    current_user: UserInfo = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List notifications for the current user."""
    user_id = await _get_user_id(db, current_user)

    # Build base query scoped to user
    query = select(Notification)
    query = build_notification_where(query, user_id)

    if status_filter and status_filter.upper() == "UNREAD":
        query = with_unread_filter(query)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Unread count (always returned)
    unread = await get_unread_count(db, user_id)

    # Paginated results
    query = query.order_by(Notification.sent_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    notifications = result.scalars().all()

    return NotificationListResponse(
        notifications=[
            NotificationOut(
                id=str(n.id),
                recipient_type=n.recipient_type,
                recipient_id=str(n.recipient_id) if n.recipient_id else None,
                notification_type=n.notification_type,
                related_entity_type=n.related_entity_type,
                related_entity_id=str(n.related_entity_id) if n.related_entity_id else None,
                title=n.title,
                message=n.message,
                sent_by=n.sent_by,
                sent_at=n.sent_at,
                read_at=n.read_at,
                status=n.status,
                created_at=n.created_at,
            )
            for n in notifications
        ],
        unread_count=unread,
        total=total,
    )


@router.get("/count", response_model=NotificationCountResponse)
async def notification_count(
    current_user: UserInfo = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight unread count for polling."""
    user_id = await _get_user_id(db, current_user)
    unread = await get_unread_count(db, user_id)
    return NotificationCountResponse(unread_count=unread)


@router.patch("", response_model=NotificationMarkReadResponse)
async def mark_read(
    body: NotificationMarkReadRequest,
    current_user: UserInfo = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark specific notifications or all as read."""
    user_id = await _get_user_id(db, current_user)

    ids = [uuid.UUID(i) for i in body.ids] if body.ids else None
    updated = await mark_notifications_read(
        db, user_id, notification_ids=ids, mark_all=body.mark_all_read
    )
    return NotificationMarkReadResponse(updated=updated)
