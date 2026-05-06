import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import BigInteger, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class InterviewSimSession(Base):
    __tablename__ = "interview_sim_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    api_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False,
        server_default=sa.text("nextval('interview_sim_sessions_api_id_seq')"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    interviewer_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    interview_style: Mapped[str] = mapped_column(
        String(30), nullable=False, default="behavioral"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    agent_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    overall_score: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

    questions = relationship(
        "InterviewSimQuestion",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="InterviewSimQuestion.question_index",
        lazy="selectin",
    )
    debrief = relationship(
        "InterviewSimDebrief",
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )
