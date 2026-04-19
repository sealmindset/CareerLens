"""Flexible embedding dimensions -- support 768-dim (MLX/nomic) in addition to 1536 (OpenAI).

Revision ID: 038
Revises: 037
"""

import os

from alembic import op

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None

DIMS = int(os.getenv("EMBEDDING_DIMENSIONS", "768"))


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_profile_chunks_embedding")
    op.execute("ALTER TABLE profile_chunks DROP COLUMN IF EXISTS embedding")
    op.execute(f"ALTER TABLE profile_chunks ADD COLUMN embedding vector({DIMS})")
    op.execute(
        "CREATE INDEX ix_profile_chunks_embedding ON profile_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_profile_chunks_embedding")
    op.execute("ALTER TABLE profile_chunks DROP COLUMN IF EXISTS embedding")
    op.execute("ALTER TABLE profile_chunks ADD COLUMN embedding vector(1536)")
    op.execute(
        "CREATE INDEX ix_profile_chunks_embedding ON profile_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )
