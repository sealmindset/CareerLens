import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class InterviewSimQuestion(Base):
    __tablename__ = "interview_sim_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    api_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False,
        server_default=sa.text("nextval('interview_sim_questions_api_id_seq')"),
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_sim_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_index: Mapped[int] = mapped_column(Integer, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    expected_signals: Mapped[list[str] | None] = mapped_column(
        ARRAY(Text), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session = relationship("InterviewSimSession", back_populates="questions")
    response = relationship(
        "InterviewSimResponse",
        back_populates="question",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )
