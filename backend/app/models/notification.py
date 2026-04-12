import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    recipient_type: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True
    )  # INTERNAL, VENDOR, ROLE
    recipient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )  # null = broadcast to all of that recipient_type
    notification_type: Mapped[str] = mapped_column(
        String(60), nullable=False, index=True
    )  # PIPELINE_COMPLETE, STORY_READY, STATUS_CHANGE, ASSIGNMENT, SYSTEM
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_entity_type: Mapped[str | None] = mapped_column(
        String(60), nullable=True
    )  # application, job, story, etc.
    related_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    sent_by: Mapped[str | None] = mapped_column(
        String(120), nullable=True
    )  # agent name, service, or "system"
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # null = unread
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="SENT", server_default="SENT"
    )  # PENDING, SENT, READ, FAILED
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
