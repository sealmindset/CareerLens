"""Interview Question Bank: capture real interview questions with linked stories.

Revision ID: 040
Revises: 039
"""

import sqlalchemy as sa
from alembic import op

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS interview_questions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            company VARCHAR(255),
            role_title VARCHAR(255),
            question_text TEXT NOT NULL,
            interview_stage VARCHAR(50),
            interview_format VARCHAR(50),
            date_asked DATE,
            topic_tags JSONB,
            linked_story_ids JSONB,
            notes TEXT,
            model_answer TEXT,
            outcome VARCHAR(50),
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            source_job_id UUID REFERENCES job_listings(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_interview_questions_user_date
            ON interview_questions (user_id, date_asked DESC)
    """))

    op.execute(sa.text("""
        INSERT INTO permissions (id, resource, action, description)
        VALUES
            (gen_random_uuid(), 'interview_questions', 'view', 'View interview question bank'),
            (gen_random_uuid(), 'interview_questions', 'create', 'Create interview questions'),
            (gen_random_uuid(), 'interview_questions', 'edit', 'Edit interview questions'),
            (gen_random_uuid(), 'interview_questions', 'delete', 'Delete interview questions')
        ON CONFLICT DO NOTHING
    """))

    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT rp.role_id, p.id
        FROM permissions p
        CROSS JOIN (
            SELECT DISTINCT role_id FROM role_permissions rp2
            JOIN permissions p2 ON rp2.permission_id = p2.id
            WHERE p2.resource = 'stories'
        ) rp
        WHERE p.resource = 'interview_questions'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE resource = 'interview_questions')"
    ))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE resource = 'interview_questions'"
    ))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_interview_questions_user_date"))
    op.execute(sa.text("DROP TABLE IF EXISTS interview_questions"))
