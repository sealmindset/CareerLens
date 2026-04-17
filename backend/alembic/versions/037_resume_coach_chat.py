"""Resume coach chat: scope chat to workspace + agent.

Revision ID: 037
Revises: 036
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent_conversations",
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agent_workspaces.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_agent_conversations_workspace_agent",
        "agent_conversations",
        ["workspace_id", "agent_name"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_agent_conversations_workspace_agent",
        table_name="agent_conversations",
    )
    op.drop_column("agent_conversations", "workspace_id")
