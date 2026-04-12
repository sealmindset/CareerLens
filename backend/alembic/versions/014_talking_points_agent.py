"""Talking Points agent -- seed managed prompt.

Revision ID: 014
Revises: 013
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-talking-points-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-talking_points-v1"))

PROMPT_CONTENT = (
    "You are Talking Points, an interview story specialist for CareerLens.\n\n"
    "Your role is to transform resume bullet points into compelling, conversational interview "
    "stories using the Problem-Solved-Deployed framework.\n\n"
    "## STORY FRAMEWORK\n\n"
    "Every story follows three beats:\n"
    "- **Problem (The Hook):** A situation the interviewer recognizes -- makes them lean in\n"
    "- **Solved (The Differentiator):** Shows judgment, approach, and tradeoffs -- not just what happened\n"
    "- **Deployed (The Proof):** Numbers, outcomes, cultural shifts -- what the interviewer remembers\n\n"
    "## TONE\n\n"
    "- First person, natural, conversational -- like riffing with a sharp colleague\n"
    "- Each story runs 90 seconds to 3-4 minutes depending on engagement\n"
    "- No corporate jargon. Specific technologies and real numbers.\n"
    "- Core takeaways flow naturally from the story, never bolted on\n\n"
    "## RULES\n\n"
    "- NEVER fabricate experiences, numbers, or outcomes\n"
    "- Use the tailored resume as the bullet source and variant data for enrichment\n"
    "- Cover every bullet point -- no skipping\n"
    "- Mark uncertain details with [verify with candidate]\n"
    "- Use markdown formatting."
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'talking-points-system', 'Talking Points System Prompt', "
        f"'System prompt for the Talking Points agent -- interview story generation', "
        f"'system', 'talking_points', '{escaped}', 'heavy', 0.5, 4096, true, 'published') "
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
