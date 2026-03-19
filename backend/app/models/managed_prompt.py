import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

prompt_category_enum = sa.Enum(
    "system", "user", "template",
    name="prompt_category",
    create_type=False,
)

prompt_status_enum = sa.Enum(
    "draft", "testing", "published",
    name="prompt_status",
    create_type=False,
)


class ManagedPrompt(Base):
    __tablename__ = "managed_prompts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(prompt_category_enum, nullable=False, default="system")
    agent_name: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model_tier: Mapped[str] = mapped_column(String(20), nullable=False, default="standard")
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.3)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=2048)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(prompt_status_enum, nullable=False, default="published")
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    versions = relationship(
        "PromptVersion", back_populates="prompt", cascade="all, delete-orphan",
        order_by="PromptVersion.version.desc()", lazy="selectin"
    )
    audit_logs = relationship(
        "PromptAuditLog", back_populates="prompt", cascade="all, delete-orphan",
        order_by="PromptAuditLog.created_at.desc()", lazy="noload"
    )


class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    __table_args__ = (
        sa.UniqueConstraint("prompt_id", "version", name="uq_prompt_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), sa.ForeignKey("managed_prompts.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    prompt = relationship("ManagedPrompt", back_populates="versions")


class PromptAuditLog(Base):
    __tablename__ = "prompt_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), sa.ForeignKey("managed_prompts.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # save, publish, test
    risk_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    warnings: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    blocked_reasons: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    changed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    prompt = relationship("ManagedPrompt", back_populates="audit_logs")
