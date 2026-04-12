import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recipient_type: str
    recipient_id: str | None
    notification_type: str
    title: str
    message: str | None
    related_entity_type: str | None
    related_entity_id: str | None
    sent_by: str | None
    sent_at: datetime
    read_at: datetime | None
    status: str
    created_at: datetime


class NotificationListResponse(BaseModel):
    notifications: list[NotificationOut]
    unread_count: int
    total: int


class NotificationCountResponse(BaseModel):
    unread_count: int


class NotificationMarkReadRequest(BaseModel):
    ids: list[str] | None = None
    mark_all_read: bool = False


class NotificationMarkReadResponse(BaseModel):
    updated: int
