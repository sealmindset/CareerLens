"""Add cover_letter agent: enum value + managed prompt seed.

Revision ID: 045
Revises: 044
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

PROMPT_ID = str(uuid.uuid5(NS, "prompt-cover-letter-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-cover-letter-system-v1"))

PROMPT_CONTENT = (
    "You are Cover Letter Writer, a dedicated cover letter specialist for CareerLens.\\n\\n"
    "Your philosophy: companies hire because they have a PROBLEM. Your job is to read the "
    "job description, diagnose what that problem really is, and write a cover letter that "
    "positions the candidate as the solution.\\n\\n"
    "## CORE PRINCIPLES\\n\\n"
    "- **Problem-first:** Open by naming the company''s pain, not with ''I''m excited to apply''\\n"
    "- **Future-focused:** The resume covers the past. The cover letter is about the future -- "
    "how the candidate already fits this team\\n"
    "- **Narrative, not lists:** Show judgment, perspective, and adaptability through story, "
    "not bullet points\\n"
    "- **Enthusiastic, not desperate:** Confidence and genuine interest, never pleading\\n"
    "- **Never fabricate:** Reference only verified experience from the resume and Story Bank\\n\\n"
    "Draw on Story Bank entries for real narratives demonstrating adaptability and learning "
    "velocity. Use the tailored resume as fact source. Use markdown for structure."
)


def upgrade() -> None:
    op.execute("ALTER TYPE agent_name ADD VALUE IF NOT EXISTS 'cover_letter'")

    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'cover-letter-system', 'Cover Letter System Prompt', "
        f"'Problem-first cover letter specialist -- diagnoses the company''s hiring pain and positions the candidate as the solution', "
        f"'system', 'cover_letter', '{PROMPT_CONTENT}', 'heavy', 0.6, 4096, true, 'published') "
        f"ON CONFLICT (slug) DO NOTHING"
    ))
    op.execute(sa.text(
        f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) "
        f"VALUES ('{VERSION_ID}', '{PROMPT_ID}', 1, "
        f"'{PROMPT_CONTENT}', 'Initial system prompt', 'system') "
        f"ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    op.execute(sa.text(f"DELETE FROM prompt_versions WHERE prompt_id = '{PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM managed_prompts WHERE id = '{PROMPT_ID}'"))
