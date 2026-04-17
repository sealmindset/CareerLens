"""Resume chat: track-scoped versions + per-session draft.

Revision ID: 036
Revises: 035
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE agent_name ADD VALUE IF NOT EXISTS 'achievement_amplifier'")
    op.execute("ALTER TYPE context_type ADD VALUE IF NOT EXISTS 'resume_amplification'")

    op.add_column(
        "resume_variant_versions",
        sa.Column("agent_track", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "resume_variant_versions",
        sa.Column(
            "source_variant_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("resume_variant_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "resume_variant_versions",
        sa.Column(
            "source_workspace_artifact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspace_artifacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "resume_variant_versions",
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("job_listings.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "resume_variant_versions",
        sa.Column(
            "authored_by_conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agent_conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    op.drop_constraint("uq_variant_version", "resume_variant_versions", type_="unique")
    op.create_unique_constraint(
        "uq_variant_track_version",
        "resume_variant_versions",
        ["variant_id", "agent_track", "version_number"],
    )

    op.add_column(
        "agent_conversations",
        sa.Column(
            "starting_variant_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("resume_variant_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "agent_conversations",
        sa.Column(
            "starting_artifact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspace_artifacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "agent_conversations",
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("job_listings.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "agent_conversations",
        sa.Column(
            "target_variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("resume_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "agent_conversations",
        sa.Column("draft_resume", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agent_conversations", "draft_resume")
    op.drop_column("agent_conversations", "target_variant_id")
    op.drop_column("agent_conversations", "job_id")
    op.drop_column("agent_conversations", "starting_artifact_id")
    op.drop_column("agent_conversations", "starting_variant_version_id")

    op.drop_constraint("uq_variant_track_version", "resume_variant_versions", type_="unique")
    op.create_unique_constraint(
        "uq_variant_version",
        "resume_variant_versions",
        ["variant_id", "version_number"],
    )

    op.drop_column("resume_variant_versions", "authored_by_conversation_id")
    op.drop_column("resume_variant_versions", "job_id")
    op.drop_column("resume_variant_versions", "source_workspace_artifact_id")
    op.drop_column("resume_variant_versions", "source_variant_version_id")
    op.drop_column("resume_variant_versions", "agent_track")
