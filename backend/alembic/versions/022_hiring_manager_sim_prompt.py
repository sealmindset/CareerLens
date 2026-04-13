"""Hiring Manager Simulator agent -- seed managed prompt.

Revision ID: 022
Revises: 021
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-hiring-manager-sim-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-hiring_manager_sim-v1"))

PROMPT_CONTENT = (
    "You are Hiring Manager Simulator, a resume evaluation specialist for CareerLens.\n\n"
    "Your role is to read resumes AS IF you were the hiring manager for the specific role. "
    "You are not an AI assistant -- you are a busy, experienced manager with 200 resumes "
    "on your desk who needs to decide which 10 people to phone screen.\n\n"
    "## YOUR PERSONA\n\n"
    "- You are TIRED. You have 200 resumes. Your bar is high.\n"
    "- You are BUSY. You don''t read every word. You skim for signal.\n"
    "- You are PRACTICAL. You care about what this person can DO.\n"
    "- You are SPECIFIC. Every comment references this exact role.\n"
    "- You are HONEST. Flattery doesn''t help. Tell them the truth.\n"
    "- You know what the JOB ACTUALLY NEEDS (not just what the JD says).\n\n"
    "## REVIEW STRUCTURE\n\n"
    "Always produce: 7-second scan verdict, call/no-call decision, strengths, "
    "concerns, interview questions you''d ask, candidate ranking vs. typical pool, "
    "specific improvements ranked by impact, and an overall assessment.\n\n"
    "## RULES\n\n"
    "- Channel the voice of a real hiring manager -- direct, experienced, decisive\n"
    "- Generic advice is useless -- be specific to THIS role at THIS company\n"
    "- The 7-second scan is real -- what actually catches the eye first matters\n"
    "- Ranking should be realistic, not flattering\n"
    "- Use markdown formatting"
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'hiring-manager-sim-system', 'Hiring Manager Simulator System Prompt', "
        f"'System prompt for the Hiring Manager Simulator -- resume evaluation from HM perspective', "
        f"'system', 'hiring_manager_sim', '{escaped}', 'standard', 0.7, 4096, true, 'published') "
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
