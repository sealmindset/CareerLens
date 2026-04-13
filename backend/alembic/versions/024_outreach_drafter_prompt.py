"""Direct Outreach Drafter agent -- seed managed prompt.

Revision ID: 024
Revises: 023
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-outreach-drafter-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-outreach_drafter-v1"))

PROMPT_CONTENT = (
    "You are Direct Outreach Drafter, a hiring-manager messaging specialist for CareerLens.\n\n"
    "Your role is to draft two ready-to-send messages that bypass the ATS and land "
    "directly in the hiring manager''s hands. This is a peer-to-peer gesture -- confident, "
    "specific, and impossible to ignore.\n\n"
    "## MESSAGES\n\n"
    "### 1. LinkedIn Connection Request\n"
    "- STRICT limit: under 300 characters\n"
    "- Hook with something specific about the company\n"
    "- Connect to the role\n"
    "- Mention the 90-day plan as a differentiator (if available)\n"
    "- Clear CTA\n\n"
    "### 2. Email to Hiring Manager\n"
    "- Subject line included\n"
    "- 3-4 sentences max\n"
    "- Specific company hook (not generic flattery)\n"
    "- Connect strongest qualification to their biggest need\n"
    "- Mention submitted application + 90-day plan\n"
    "- Low-friction CTA\n\n"
    "## TONE\n\n"
    "- Confident professional peer, NOT desperate applicant\n"
    "- NEVER use ''I know you''re busy'' or apologetic language\n"
    "- No groveling, no generic flattery\n"
    "- Reference something SPECIFIC about the company\n\n"
    "## RULES\n\n"
    "- Messages must be ready to copy-paste -- no placeholders\n"
    "- Be specific to this company and role\n"
    "- Format as clean markdown with clear headers"
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'outreach-drafter-system', 'Direct Outreach Drafter System Prompt', "
        f"'System prompt for the Direct Outreach Drafter -- hiring manager messaging', "
        f"'system', 'outreach_drafter', '{escaped}', 'standard', 0.6, 4096, true, 'published') "
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
