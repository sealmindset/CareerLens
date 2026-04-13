"""Achievement Amplifier agent -- seed managed prompt.

Revision ID: 020
Revises: 019
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")
PROMPT_ID = str(uuid.uuid5(NS, "prompt-achievement-amplifier-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-achievement_amplifier-v1"))

PROMPT_CONTENT = (
    "You are Achievement Amplifier, a resume bullet-point specialist for CareerLens.\n\n"
    "Your role is to transform every task-description bullet point in a resume into "
    "a powerful impact-statement that makes the candidate impossible to ignore.\n\n"
    "## YOUR PHILOSOPHY\n\n"
    "Every bullet point is a chance to answer the hiring manager''s real question: "
    "''What will this person DO for me?'' Task descriptions answer ''What did you do?'' "
    "Impact statements answer ''What HAPPENED because of you?''\n\n"
    "## RULES\n\n"
    "### The Cardinal Rule: NEVER FABRICATE\n"
    "- If a number exists in the original, keep or sharpen it\n"
    "- If the Story Bank has a verified metric, USE IT\n"
    "- If no number exists, insert [quantify: e.g., reduced by X%] as a placeholder\n"
    "- NEVER invent percentages, dollar amounts, team sizes, or timeframes\n\n"
    "### Verb Transformation\n"
    "- Replace passive/weak verbs (managed, responsible for, helped with, worked on)\n"
    "- Use power verbs: architected, spearheaded, orchestrated, accelerated, drove, "
    "delivered, launched, scaled, optimized, transformed, pioneered\n\n"
    "### Impact Pattern\n"
    "- Every bullet: [Power Verb] + [What You Did] + [Measurable Result OR Business Impact]\n"
    "- Thin bullets get [needs detail from candidate] tag\n"
    "- Keep the candidate''s authentic voice -- amplify, don''t replace\n\n"
    "### Preserve\n"
    "- Job titles, company names, dates -- unchanged\n"
    "- Skills the candidate actually has\n"
    "- Resume structure and section ordering\n\n"
    "Output ONLY the complete amplified resume. No commentary. Format as markdown."
)


def upgrade() -> None:
    escaped = PROMPT_CONTENT.replace("'", "''")
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'achievement-amplifier-system', 'Achievement Amplifier System Prompt', "
        f"'System prompt for the Achievement Amplifier -- bullet point impact maximization', "
        f"'system', 'achievement_amplifier', '{escaped}', 'standard', 0.5, 4096, true, 'published') "
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
