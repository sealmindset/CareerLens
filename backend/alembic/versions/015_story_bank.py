"""Story Bank -- persistent interview story library with version control.

Revision ID: 015
Revises: 014
"""

import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- story_bank_stories ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS story_bank_stories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_bullet TEXT NOT NULL,
            source_variant_id UUID REFERENCES resume_variants(id) ON DELETE SET NULL,
            source_company VARCHAR(255),
            source_title VARCHAR(255),
            story_title VARCHAR(255) NOT NULL,
            problem TEXT NOT NULL,
            solved TEXT NOT NULL,
            deployed TEXT NOT NULL,
            takeaway TEXT,
            hook_line VARCHAR(500),
            trigger_keywords JSONB,
            proof_metric VARCHAR(255),
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            times_used INTEGER NOT NULL DEFAULT 0,
            current_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    # --- story_bank_versions ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS story_bank_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            story_id UUID NOT NULL REFERENCES story_bank_stories(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            problem TEXT,
            solved TEXT,
            deployed TEXT,
            takeaway TEXT,
            hook_line VARCHAR(500),
            trigger_keywords JSONB,
            proof_metric VARCHAR(255),
            change_summary TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_story_bank_version UNIQUE (story_id, version_number)
        )
    """))

    # --- Add stories permissions ---
    op.execute(sa.text("""
        INSERT INTO permissions (id, resource, action, description)
        VALUES
            (gen_random_uuid(), 'stories', 'view', 'View story bank'),
            (gen_random_uuid(), 'stories', 'edit', 'Edit story bank')
        ON CONFLICT DO NOTHING
    """))

    # Grant stories permissions to all roles that have profile permissions
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT rp.role_id, p.id
        FROM permissions p
        CROSS JOIN (
            SELECT DISTINCT role_id FROM role_permissions rp2
            JOIN permissions p2 ON rp2.permission_id = p2.id
            WHERE p2.resource = 'profile'
        ) rp
        WHERE p.resource = 'stories'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'stories')"))
    op.execute(sa.text("DELETE FROM permissions WHERE resource = 'stories'"))
    op.execute(sa.text("DROP TABLE IF EXISTS story_bank_versions"))
    op.execute(sa.text("DROP TABLE IF EXISTS story_bank_stories"))
