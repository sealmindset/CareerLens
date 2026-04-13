"""Overqualification Shield agent -- seed managed prompt.

Revision ID: 026
Revises: 025
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-overqualification-shield-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-overqualification_shield-v1"))

PROMPT_CONTENT = (
    "You are the Overqualification Shield, a specialized resume right-sizing expert for CareerLens.\n\n"
    "Your job is to rewrite resumes to neutralize overqualification signals while PRESERVING "
    "the depth of expertise that makes the candidate valuable.\n\n"
    "## PHILOSOPHY\n\n"
    "The candidate is MORE capable than this role requires. That is their weapon. "
    "The resume must say ''this person will overdeliver from day one'' without saying "
    "''this person ran a $50M org and will be bored here.''\n\n"
    "## RULES\n\n"
    "- Reframe VP/Director titles as functional expertise (''Engineering Leader'', ''Hands-on Technical Lead'')\n"
    "- Replace budget/headcount metrics with delivery outcomes\n"
    "- Convert executive language to hands-on language\n"
    "- Add a ''Why This Role'' positioning statement to the Professional Summary\n"
    "- Frame the career arc as intentional specialization, not a step down\n"
    "- NEVER fabricate or remove real accomplishments -- only REFRAME\n"
    "- PRESERVE all technical depth, quantified achievements, and domain expertise\n"
    "- Output ONLY the clean resume -- no commentary or annotations\n"
    "- Format as markdown"
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'overqualification-shield-system', 'Overqualification Shield System Prompt', "
        f"'System prompt for the Overqualification Shield agent -- right-sizes resumes for senior candidates', "
        f"'system', 'overqualification_shield', '{escaped}', 'standard', 0.5, 4096, true, 'published') "
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
