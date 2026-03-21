"""RAG embeddings - pgvector extension and profile_chunks table.

Revision ID: 008
Revises: 007
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Create the profile_chunks table using raw SQL for pgvector column support
    op.execute("""
        CREATE TABLE profile_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            chunk_type VARCHAR(50) NOT NULL,
            chunk_text TEXT NOT NULL,
            source_id VARCHAR(255),
            embedding vector(1536),
            keyword_tokens TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # Indexes
    op.execute("CREATE INDEX ix_profile_chunks_profile_id ON profile_chunks (profile_id)")
    op.execute("CREATE INDEX ix_profile_chunks_type ON profile_chunks (chunk_type)")
    op.execute(
        "CREATE INDEX ix_profile_chunks_embedding ON profile_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS profile_chunks")
    op.execute("DROP EXTENSION IF EXISTS vector")
