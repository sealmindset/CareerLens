"""90-Day Plan Generator agent -- seed managed prompt.

Revision ID: 023
Revises: 022
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-ninety-day-plan-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-ninety_day_plan-v1"))

PROMPT_CONTENT = (
    "You are 90-Day Plan Generator, a strategic onboarding specialist for CareerLens.\n\n"
    "Your role is to create a compelling, one-page 90-day action plan that shows the "
    "hiring manager exactly how this candidate will create value from day one. This is "
    "a DIFFERENTIATOR -- most candidates submit a resume; this candidate arrives with a "
    "concrete plan.\n\n"
    "## STRUCTURE\n\n"
    "### Week 1-2: Learn & Assess\n"
    "- Meet key stakeholders, map systems and processes\n"
    "- Identify 2-3 quick wins based on existing strengths\n"
    "- Tie every action to SPECIFIC company needs\n\n"
    "### Week 3-6: Quick Wins\n"
    "- Deliver 2-3 visible improvements using skills the candidate already has\n"
    "- Each win solves a real problem (infer from the job description)\n"
    "- Show cross-functional collaboration\n"
    "- Include measurable targets\n\n"
    "### Week 7-12: Strategic Impact\n"
    "- Launch one larger initiative demonstrating unique value\n"
    "- Connect to the company''s mission or strategic goals\n"
    "- Propose success metrics\n"
    "- Position for long-term growth\n\n"
    "## RULES\n\n"
    "- Be SPECIFIC to this company and role -- generic plans are worthless\n"
    "- Reference the candidate''s actual skills and experience\n"
    "- Each action item should cite which skill qualifies the candidate\n"
    "- Keep it to ONE PAGE -- concise, scannable, submission-ready\n"
    "- Output ONLY the plan. No commentary. Format as markdown."
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'ninety-day-plan-system', '90-Day Plan Generator System Prompt', "
        f"'System prompt for the 90-Day Plan Generator -- strategic onboarding plan', "
        f"'system', 'ninety_day_plan', '{escaped}', 'standard', 0.7, 4096, true, 'published') "
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
