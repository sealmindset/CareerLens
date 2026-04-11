"""Resume variants with version control and application tracking.

Revision ID: 013
Revises: 012
"""

import sqlalchemy as sa
from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- resume_variants ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS resume_variants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL,
            description TEXT,
            target_roles TEXT,
            matching_keywords JSONB,
            usage_guidance TEXT,
            is_default BOOLEAN NOT NULL DEFAULT false,
            headline VARCHAR(500),
            summary TEXT,
            raw_resume_text TEXT,
            skills JSONB,
            experiences JSONB,
            educations JSONB,
            certifications JSONB,
            additional_sections JSONB,
            current_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_resume_variant_user_slug UNIQUE (user_id, slug)
        )
    """))

    # --- resume_variant_versions ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS resume_variant_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            variant_id UUID NOT NULL REFERENCES resume_variants(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            headline VARCHAR(500),
            summary TEXT,
            raw_resume_text TEXT,
            skills JSONB,
            experiences JSONB,
            educations JSONB,
            certifications JSONB,
            additional_sections JSONB,
            change_summary TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_variant_version UNIQUE (variant_id, version_number)
        )
    """))

    # --- Add resume variant tracking to applications ---
    op.execute(sa.text("""
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS resume_variant_id UUID REFERENCES resume_variants(id) ON DELETE SET NULL
    """))
    op.execute(sa.text("""
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS resume_type VARCHAR(20) DEFAULT 'original'
    """))

    # --- Add resumes permissions ---
    op.execute(sa.text("""
        INSERT INTO permissions (id, resource, action, description)
        VALUES
            (gen_random_uuid(), 'resumes', 'view', 'View resume variants'),
            (gen_random_uuid(), 'resumes', 'edit', 'Edit resume variants')
        ON CONFLICT DO NOTHING
    """))

    # Grant resumes permissions to all roles that have profile permissions
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT rp.role_id, p.id
        FROM permissions p
        CROSS JOIN (
            SELECT DISTINCT role_id FROM role_permissions rp2
            JOIN permissions p2 ON rp2.permission_id = p2.id
            WHERE p2.resource = 'profile'
        ) rp
        WHERE p.resource = 'resumes'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE applications DROP COLUMN IF EXISTS resume_type"))
    op.execute(sa.text("ALTER TABLE applications DROP COLUMN IF EXISTS resume_variant_id"))
    op.execute(sa.text("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'resumes')"))
    op.execute(sa.text("DELETE FROM permissions WHERE resource = 'resumes'"))
    op.execute(sa.text("DROP TABLE IF EXISTS resume_variant_versions"))
    op.execute(sa.text("DROP TABLE IF EXISTS resume_variants"))
