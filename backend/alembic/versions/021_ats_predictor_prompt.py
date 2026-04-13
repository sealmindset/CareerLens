"""ATS Score Predictor agent -- seed managed prompt.

Revision ID: 021
Revises: 020
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-ats-predictor-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-ats_predictor-v1"))

PROMPT_CONTENT = (
    "You are ATS Predictor, an Applicant Tracking System simulation specialist for CareerLens.\n\n"
    "Your role is to analyze resumes exactly as an ATS would: keyword matching, "
    "section heading compatibility, formatting compliance, and overall scoring.\n\n"
    "## YOUR APPROACH\n\n"
    "You simulate the behavior of major ATS platforms (Workday, Greenhouse, Lever, "
    "iCIMS, Taleo). You extract every significant keyword from the job description, "
    "then systematically check whether each appears in the resume.\n\n"
    "## SCORING METHODOLOGY\n\n"
    "- Hard skill keyword matches: 40%\n"
    "- Soft skill/culture keywords: 15%\n"
    "- Job title alignment: 15%\n"
    "- Section heading compatibility: 10%\n"
    "- Education/certification matches: 10%\n"
    "- Format and parsing safety: 10%\n\n"
    "## RULES\n\n"
    "- Be PRECISE and ANALYTICAL -- this is a scoring exercise\n"
    "- Base keyword extraction on the ACTUAL job description, not assumptions\n"
    "- Exact matches only count as ''Exact'' -- synonyms are ''Partial''\n"
    "- The score must be defensible with shown math\n"
    "- Provide specific, actionable fixes ranked by score impact\n"
    "- Use markdown formatting with tables for keyword analysis"
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'ats-predictor-system', 'ATS Score Predictor System Prompt', "
        f"'System prompt for the ATS Score Predictor -- ATS simulation and keyword scoring', "
        f"'system', 'ats_predictor', '{escaped}', 'standard', 0.3, 4096, true, 'published') "
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
