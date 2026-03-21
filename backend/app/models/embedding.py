import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None


class ProfileChunk(Base):
    """Stores chunked and embedded profile content for RAG retrieval."""

    __tablename__ = "profile_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "experience", "skill", "education", "summary", "resume_text"
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # ID of the source record (experience id, skill id, etc.)
    embedding = mapped_column(
        Vector(1536) if Vector else sa.LargeBinary, nullable=True
    )
    keyword_tokens: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # JSON array of lowercase tokens for keyword matching
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    profile = relationship("Profile", backref="chunks")
