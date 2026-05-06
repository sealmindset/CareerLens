import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class InterviewSimResponse(Base):
    __tablename__ = "interview_sim_responses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    api_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False,
        server_default=sa.text("nextval('interview_sim_responses_api_id_seq')"),
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_sim_questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_sim_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Communication metrics
    filler_word_count: Mapped[int] = mapped_column(Integer, default=0)
    filler_words: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    silence_gaps: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    pace_wpm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # AI evaluation scores (0.0 - 1.0)
    clarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    specificity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    structure_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    example_quality: Mapped[str | None] = mapped_column(String(20), nullable=True)
    evaluator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Behavioural signals
    stalled: Mapped[bool] = mapped_column(Boolean, default=False)
    was_nudged: Mapped[bool] = mapped_column(Boolean, default=False)
    trailing_off_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    question = relationship("InterviewSimQuestion", back_populates="response")
