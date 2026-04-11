import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ResumeVariant(Base):
    __tablename__ = "resume_variants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_roles: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # comma-separated role titles this variant targets
    matching_keywords: Mapped[list | None] = mapped_column(
        JSONB, nullable=True
    )  # keywords that signal this variant should be used
    usage_guidance: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # when to use this variant (user's notes)
    is_default: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, nullable=False
    )
    headline: Mapped[str | None] = mapped_column(String(500), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    experiences: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    educations: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    certifications: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    additional_sections: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
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
    user = relationship("User", backref="resume_variants", lazy="selectin")
    versions = relationship(
        "ResumeVariantVersion",
        back_populates="variant",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ResumeVariantVersion.version_number.desc()",
    )

    __table_args__ = (
        sa.UniqueConstraint("user_id", "slug", name="uq_resume_variant_user_slug"),
    )


class ResumeVariantVersion(Base):
    __tablename__ = "resume_variant_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_variants.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    headline: Mapped[str | None] = mapped_column(String(500), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    experiences: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    educations: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    certifications: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    additional_sections: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    variant = relationship("ResumeVariant", back_populates="versions")

    __table_args__ = (
        sa.UniqueConstraint(
            "variant_id", "version_number", name="uq_variant_version"
        ),
    )
