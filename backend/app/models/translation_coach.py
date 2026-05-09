import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class TranslationQuestion(Base):
    __tablename__ = "translation_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TranslationSession(Base):
    __tablename__ = "translation_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    question_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_drift_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    user = relationship("User", lazy="selectin")
    attempts = relationship(
        "TranslationAttempt",
        back_populates="session",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TranslationAttempt.created_at.asc()",
    )


class TranslationAttempt(Base):
    __tablename__ = "translation_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("translation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("translation_questions.id", ondelete="SET NULL"),
        nullable=True,
    )
    custom_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_answer: Mapped[str] = mapped_column(Text, nullable=False)
    drift_score: Mapped[float] = mapped_column(Float, nullable=False)
    signal: Mapped[str] = mapped_column(String(10), nullable=False)
    scoring_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False)
    flagged_phrases: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    translated_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    coaching_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session = relationship("TranslationSession", back_populates="attempts")
    question = relationship("TranslationQuestion", lazy="selectin")
