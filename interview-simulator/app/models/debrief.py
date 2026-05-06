import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class InterviewSimDebrief(Base):
    __tablename__ = "interview_sim_debriefs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    api_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False,
        server_default=sa.text("nextval('interview_sim_debriefs_api_id_seq')"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_sim_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # Scores (0–100)
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clarity_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    specificity_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    structure_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conciseness_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Qualitative (markdown)
    what_landed: Mapped[str | None] = mapped_column(Text, nullable=True)
    what_missed: Mapped[str | None] = mapped_column(Text, nullable=True)
    portfolio_gaps: Mapped[str | None] = mapped_column(Text, nullable=True)
    improvement_plan: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Context-aware sections (populated when agent_context provided)
    story_utilization: Mapped[str | None] = mapped_column(Text, nullable=True)
    gap_correlation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Export tracking
    exported_to_workspace: Mapped[bool] = mapped_column(Boolean, default=False)
    workspace_artifact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session = relationship("InterviewSimSession", back_populates="debrief", viewonly=True)
