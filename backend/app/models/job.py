import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

job_type_enum = sa.Enum(
    "full_time", "part_time", "contract", "remote",
    name="job_type",
    create_type=True,
)

job_source_enum = sa.Enum(
    "linkedin", "indeed", "glassdoor", "company_site", "manual",
    name="job_source",
    create_type=True,
)

job_status_enum = sa.Enum(
    "new", "analyzing", "analyzed", "applied", "archived",
    name="job_status",
    create_type=True,
)

requirement_type_enum = sa.Enum(
    "required", "preferred", "nice_to_have",
    name="requirement_type",
    create_type=True,
)


class JobListing(Base):
    __tablename__ = "job_listings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    salary_range: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_type: Mapped[str | None] = mapped_column(job_type_enum, nullable=True)
    source: Mapped[str] = mapped_column(
        job_source_enum, nullable=False, default="manual"
    )
    status: Mapped[str] = mapped_column(
        job_status_enum, nullable=False, default="new"
    )
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    match_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "url", name="uq_job_listing_user_url"),
    )

    # Relationships
    user = relationship("User", backref="job_listings", lazy="selectin")
    requirements = relationship(
        "JobRequirement", back_populates="job_listing", cascade="all, delete-orphan", lazy="selectin"
    )


class JobRequirement(Base):
    __tablename__ = "job_requirements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_listings.id", ondelete="CASCADE"), nullable=False
    )
    requirement_text: Mapped[str] = mapped_column(Text, nullable=False)
    requirement_type: Mapped[str] = mapped_column(
        requirement_type_enum, nullable=False, default="required"
    )
    is_met: Mapped[bool | None] = mapped_column(sa.Boolean, nullable=True)
    gap_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    job_listing = relationship("JobListing", back_populates="requirements")
