"""Pipeline stages, priority, interview journal, configurable reminders.

Adds pipeline_stage + pipeline_stage_updated_at to applications,
priority to job_listings, interview_journal_entries table,
reminder_settings JSONB to events, and interview_journal RBAC permissions.

Revision ID: 042
Revises: 041
"""

import sqlalchemy as sa
from alembic import op

revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A. applications: pipeline_stage + pipeline_stage_updated_at
    op.execute(sa.text("""
        ALTER TABLE applications
            ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) NOT NULL DEFAULT 'tbat',
            ADD COLUMN IF NOT EXISTS pipeline_stage_updated_at TIMESTAMPTZ
    """))

    # B. job_listings: priority
    op.execute(sa.text("""
        ALTER TABLE job_listings
            ADD COLUMN IF NOT EXISTS priority INTEGER
    """))

    # C. events: reminder_settings JSONB
    op.execute(sa.text("""
        ALTER TABLE events
            ADD COLUMN IF NOT EXISTS reminder_settings JSONB
    """))

    # D. interview_journal_entries table
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS interview_journal_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            event_id UUID REFERENCES events(id) ON DELETE SET NULL,
            pipeline_stage VARCHAR(50),
            entry_type VARCHAR(30) NOT NULL DEFAULT 'note',
            title VARCHAR(500),
            content TEXT,
            outcome VARCHAR(30),
            entry_date TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_journal_app_date
            ON interview_journal_entries (application_id, entry_date DESC)
    """))

    # E. RBAC: interview_journal permissions
    op.execute(sa.text("""
        INSERT INTO permissions (id, resource, action, description)
        VALUES
            (gen_random_uuid(), 'interview_journal', 'view', 'View interview journal entries'),
            (gen_random_uuid(), 'interview_journal', 'create', 'Create interview journal entries'),
            (gen_random_uuid(), 'interview_journal', 'edit', 'Edit interview journal entries'),
            (gen_random_uuid(), 'interview_journal', 'delete', 'Delete interview journal entries')
        ON CONFLICT DO NOTHING
    """))

    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT rp.role_id, p.id
        FROM permissions p
        CROSS JOIN (
            SELECT DISTINCT role_id FROM role_permissions rp2
            JOIN permissions p2 ON rp2.permission_id = p2.id
            WHERE p2.resource = 'events'
        ) rp
        WHERE p.resource = 'interview_journal'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE resource = 'interview_journal')"
    ))
    op.execute(sa.text("DELETE FROM permissions WHERE resource = 'interview_journal'"))
    op.execute(sa.text("DROP TABLE IF EXISTS interview_journal_entries"))
    op.execute(sa.text("ALTER TABLE events DROP COLUMN IF EXISTS reminder_settings"))
    op.execute(sa.text("ALTER TABLE job_listings DROP COLUMN IF EXISTS priority"))
    op.execute(sa.text("ALTER TABLE applications DROP COLUMN IF EXISTS pipeline_stage_updated_at"))
    op.execute(sa.text("ALTER TABLE applications DROP COLUMN IF EXISTS pipeline_stage"))
