import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class StoryBankStory(Base):
    __tablename__ = "story_bank_stories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source_bullet: Mapped[str] = mapped_column(Text, nullable=False)
    source_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_variants.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    story_title: Mapped[str] = mapped_column(String(255), nullable=False)
    problem: Mapped[str] = mapped_column(Text, nullable=False)
    solved: Mapped[str] = mapped_column(Text, nullable=False)
    deployed: Mapped[str] = mapped_column(Text, nullable=False)
    takeaway: Mapped[str | None] = mapped_column(Text, nullable=True)
    hook_line: Mapped[str | None] = mapped_column(String(500), nullable=True)
    trigger_keywords: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    proof_metric: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False
    )
    times_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
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
    user = relationship("User", backref="story_bank_stories", lazy="selectin")
    source_variant = relationship("ResumeVariant", lazy="selectin")
    versions = relationship(
        "StoryBankStoryVersion",
        back_populates="story",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StoryBankStoryVersion.version_number.desc()",
    )


class StoryBankStoryVersion(Base):
    __tablename__ = "story_bank_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("story_bank_stories.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    problem: Mapped[str | None] = mapped_column(Text, nullable=True)
    solved: Mapped[str | None] = mapped_column(Text, nullable=True)
    deployed: Mapped[str | None] = mapped_column(Text, nullable=True)
    takeaway: Mapped[str | None] = mapped_column(Text, nullable=True)
    hook_line: Mapped[str | None] = mapped_column(String(500), nullable=True)
    trigger_keywords: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    proof_metric: Mapped[str | None] = mapped_column(String(255), nullable=True)
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    story = relationship("StoryBankStory", back_populates="versions")

    __table_args__ = (
        sa.UniqueConstraint(
            "story_id", "version_number", name="uq_story_bank_version"
        ),
    )
