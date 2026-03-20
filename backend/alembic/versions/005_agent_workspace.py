"""Agent workspace, artifacts, and pipeline tables.

Revision ID: 005
Revises: 004
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # agent_workspaces
    op.create_table(
        "agent_workspaces",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "application_id", UUID(as_uuid=True),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False, unique=True,
        ),
        sa.Column(
            "user_id", UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # workspace_artifacts
    op.create_table(
        "workspace_artifacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id", UUID(as_uuid=True),
            sa.ForeignKey("agent_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_name", sa.String(50), nullable=False),
        sa.Column("artifact_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("content_format", sa.String(20), nullable=False, server_default="markdown"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # pipeline_runs
    op.create_table(
        "pipeline_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id", UUID(as_uuid=True),
            sa.ForeignKey("agent_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pipeline_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("current_agent", sa.String(50), nullable=True),
        sa.Column("completed_agents", sa.Text, nullable=False, server_default="[]"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Add workspace permissions using gen_random_uuid()
    op.execute(sa.text("""
        INSERT INTO permissions (id, resource, action, description)
        VALUES
            (gen_random_uuid(), 'workspace', 'view', 'View agent workspaces and artifacts'),
            (gen_random_uuid(), 'workspace', 'create', 'Create workspaces and run agents'),
            (gen_random_uuid(), 'workspace', 'edit', 'Edit workspace artifacts'),
            (gen_random_uuid(), 'workspace', 'delete', 'Delete workspaces')
        ON CONFLICT DO NOTHING
    """))

    # Grant workspace permissions to roles
    # Super Admin + Admin get all 4
    for role_name in ("Super Admin", "Admin"):
        op.execute(
            sa.text("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id FROM roles r, permissions p
                WHERE r.name = :role_name AND p.resource = 'workspace'
                ON CONFLICT DO NOTHING
            """).bindparams(role_name=role_name)
        )

    # Pro User gets view, create, edit (not delete)
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.name = 'Pro User' AND p.resource = 'workspace' AND p.action != 'delete'
        ON CONFLICT DO NOTHING
    """))

    # User gets view only
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.name = 'User' AND p.resource = 'workspace' AND p.action = 'view'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    op.drop_table("pipeline_runs")
    op.drop_table("workspace_artifacts")
    op.drop_table("agent_workspaces")

    op.execute(sa.text("""
        DELETE FROM role_permissions WHERE permission_id IN (
            SELECT id FROM permissions WHERE resource = 'workspace'
        )
    """))
    op.execute(sa.text("DELETE FROM permissions WHERE resource = 'workspace'"))
