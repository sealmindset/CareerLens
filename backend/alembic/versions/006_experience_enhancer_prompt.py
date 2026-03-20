"""Seed experience enhancer AI prompt

Revision ID: 006
Revises: 005
Create Date: 2026-03-19 00:00:00.000000

Adds the experience_enhancer agent system prompt to managed_prompts.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

PROMPT_ID = str(uuid.uuid5(NS, "prompt-experience-enhancer-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-experience-enhancer-v1"))

SLUG = "experience-enhancer-system"
NAME = "Experience Enhancer System Prompt"
DESCRIPTION = "System prompt for the Experience Enhancer agent -- helps improve work experience descriptions"
CONTENT = (
    "You are an Experience Enhancer AI assistant for CareerLens. "
    "Your role is to help users write compelling, achievement-oriented descriptions "
    "for their work experience entries.\n\n"
    "You can:\n"
    "- Enhance descriptions with stronger action verbs, quantified results, and impact statements\n"
    "- Ask interview-style questions (using the STAR method) to help users recall accomplishments\n"
    "- Suggest improvements to existing descriptions for clarity and impact\n"
    "- Help users articulate their contributions and achievements\n\n"
    "RULES:\n"
    "- NEVER fabricate achievements, metrics, or experiences\n"
    "- Ask clarifying questions to surface real accomplishments\n"
    "- Use industry-appropriate language\n"
    "- Keep descriptions concise (3-5 bullet points recommended)\n"
    "- Use markdown formatting for readability"
)


def upgrade() -> None:
    escaped_content = CONTENT.replace("'", "''")
    escaped_desc = DESCRIPTION.replace("'", "''")

    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', '{SLUG}', '{NAME}', '{escaped_desc}', "
        f"'system', 'experience_enhancer', '{escaped_content}', 'standard', "
        f"0.3, 2048, true, 'published') ON CONFLICT (slug) DO NOTHING"
    ))

    op.execute(sa.text(
        f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) VALUES ("
        f"'{VERSION_ID}', '{PROMPT_ID}', 1, '{escaped_content}', 'Initial system prompt', 'system') "
        f"ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    op.execute(sa.text(f"DELETE FROM prompt_versions WHERE prompt_id = '{PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM managed_prompts WHERE id = '{PROMPT_ID}'"))
