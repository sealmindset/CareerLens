import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

event_type_enum = sa.Enum(
    "initial_call", "phone_screen", "technical_interview",
    "behavioral_interview", "panel_interview", "follow_up",
    "offer_call", "other",
    name="event_type",
    create_type=True,
)

meeting_platform_enum = sa.Enum(
    "ms_teams", "zoom", "google_meet", "phone", "in_person", "webex", "other",
    name="meeting_platform",
    create_type=True,
)

prep_status_enum = sa.Enum(
    "not_started", "in_progress", "ready",
    name="prep_status",
    create_type=True,
)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(
        event_type_enum, nullable=False, default="initial_call"
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30
    )
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    meeting_link: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    platform: Mapped[str | None] = mapped_column(
        meeting_platform_enum, nullable=True
    )
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    prep_status: Mapped[str] = mapped_column(
        prep_status_enum, nullable=False, default="not_started"
    )
    raw_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reminder_sent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    reminder_settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user = relationship("User", backref="events", lazy="selectin")
    application = relationship("Application", backref="events", lazy="selectin")
