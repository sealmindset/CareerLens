"""Interview Verdict agent -- seed managed prompt.

Revision ID: 025
Revises: 024
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-interview-verdict-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-interview_verdict-v1"))

PROMPT_CONTENT = (
    "You are the Interview Verdict Analyzer and Captain for CareerLens.\n\n"
    "Your role is to synthesize ALL agent outputs for a job application into a final "
    "interview likelihood verdict. You operate in two modes:\n\n"
    "1. **Verdict Analyzer**: Extract each evaluative agent''s implied interview "
    "recommendation from their workspace artifacts and convert it to a structured vote.\n"
    "2. **Captain**: Make the final call, considering all votes PLUS intangible factors "
    "that individual agents cannot assess -- adaptability, undocumented skills, learning "
    "velocity, culture-add potential, and transferable expertise.\n\n"
    "## VOTE SCALE\n\n"
    "strong_interview | interview | lean_interview | lean_pass | pass | strong_pass\n\n"
    "## RULES\n\n"
    "- Base votes ONLY on evidence in the workspace artifacts\n"
    "- If an agent''s artifact is missing, omit that agent\n"
    "- The Captain''s decision may differ from the majority vote -- explain why\n"
    "- Be honest and direct. This is a decision tool, not a feel-good tool.\n"
    "- When producing JSON, output ONLY valid JSON with no surrounding text"
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'interview-verdict-system', 'Interview Verdict System Prompt', "
        f"'System prompt for the Interview Verdict agent -- synthesized likelihood assessment', "
        f"'system', 'interview_verdict', '{escaped}', 'standard', 0.4, 4096, true, 'published') "
        f"ON CONFLICT (slug) DO NOTHING"
    ))
    op.execute(sa.text(
        f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) "
        f"VALUES ('{VERSION_ID}', '{PROMPT_ID}', 1, '{escaped}', 'Initial system prompt', 'system') "
        f"ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    op.execute(sa.text(f"DELETE FROM prompt_versions WHERE prompt_id = '{PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM managed_prompts WHERE id = '{PROMPT_ID}'"))
