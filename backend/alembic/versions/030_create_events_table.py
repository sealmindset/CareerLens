"""Create events table and add events resource permissions.

JARVIS Command Center -- events track scheduled calls, interviews, and
meetings linked to applications. Each application can have multiple events.

Revision ID: 030
Revises: 029
"""

import sqlalchemy as sa
from alembic import op

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enums
    event_type_enum = sa.Enum(
        "initial_call", "phone_screen", "technical_interview",
        "behavioral_interview", "panel_interview", "follow_up",
        "offer_call", "other",
        name="event_type",
    )
    meeting_platform_enum = sa.Enum(
        "ms_teams", "zoom", "google_meet", "phone", "in_person", "webex", "other",
        name="meeting_platform",
    )
    prep_status_enum = sa.Enum(
        "not_started", "in_progress", "ready",
        name="prep_status",
    )

    op.create_table(
        "events",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("application_id", sa.dialects.postgresql.UUID(as_uuid=True),
                   sa.ForeignKey("applications.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", event_type_enum, nullable=False, server_default="initial_call"),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=True),
        sa.Column("duration_minutes", sa.Integer, nullable=False, server_default="30"),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        sa.Column("meeting_link", sa.String(2000), nullable=True),
        sa.Column("platform", meeting_platform_enum, nullable=True),
        sa.Column("location", sa.String(500), nullable=True),
        sa.Column("prep_status", prep_status_enum, nullable=False, server_default="not_started"),
        sa.Column("raw_note", sa.Text, nullable=True),
        sa.Column("parsed_data", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("reminder_sent", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Index on user_id + scheduled_at for fast upcoming-events queries
    op.create_index("ix_events_user_scheduled", "events", ["user_id", "scheduled_at"])

    # Add events resource permissions (view, create, edit, delete)
    conn = op.get_bind()
    conn.execute(sa.text("""
        INSERT INTO permissions (id, resource, action, description)
        VALUES
            (gen_random_uuid(), 'events', 'view', 'View events'),
            (gen_random_uuid(), 'events', 'create', 'Create events'),
            (gen_random_uuid(), 'events', 'edit', 'Edit events'),
            (gen_random_uuid(), 'events', 'delete', 'Delete events')
        ON CONFLICT DO NOTHING
    """))

    # Grant all events permissions to Super Admin, Admin, Pro User, and User roles
    conn.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE p.resource = 'events'
          AND (
            r.name IN ('Super Admin', 'Admin', 'Pro User', 'User')
          )
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    conn = op.get_bind()

    # Remove role_permissions for events
    conn.execute(sa.text("""
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions WHERE resource = 'events'
        )
    """))

    # Remove events permissions
    conn.execute(sa.text("DELETE FROM permissions WHERE resource = 'events'"))

    op.drop_index("ix_events_user_scheduled", "events")
    op.drop_table("events")

    # Drop enums
    op.execute(sa.text("DROP TYPE IF EXISTS prep_status"))
    op.execute(sa.text("DROP TYPE IF EXISTS meeting_platform"))
    op.execute(sa.text("DROP TYPE IF EXISTS event_type"))
