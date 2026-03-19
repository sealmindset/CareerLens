import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

agent_name_enum = sa.Enum(
    "scout", "tailor", "coach", "strategist", "brand_advisor", "coordinator",
    name="agent_name",
    create_type=True,
)

context_type_enum = sa.Enum(
    "job_analysis", "resume_tailoring", "gap_interview", "brand_research", "form_filling", "general",
    name="context_type",
    create_type=True,
)

conversation_status_enum = sa.Enum(
    "active", "completed", "paused",
    name="conversation_status",
    create_type=True,
)

message_role_enum = sa.Enum(
    "system", "user", "assistant",
    name="message_role",
    create_type=True,
)


class AgentConversation(Base):
    __tablename__ = "agent_conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    agent_name: Mapped[str] = mapped_column(agent_name_enum, nullable=False)
    context_type: Mapped[str] = mapped_column(context_type_enum, nullable=False)
    context_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        conversation_status_enum, nullable=False, default="active"
    )
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
    user = relationship("User", backref="agent_conversations", lazy="selectin")
    messages = relationship(
        "AgentMessage", back_populates="conversation", cascade="all, delete-orphan", lazy="selectin"
    )


class AgentMessage(Base):
    __tablename__ = "agent_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(message_role_enum, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    conversation = relationship("AgentConversation", back_populates="messages")
