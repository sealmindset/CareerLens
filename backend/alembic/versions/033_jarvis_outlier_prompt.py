"""Seed JARVIS outlier-structurer managed prompt.

Revision ID: 033
Revises: 032
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

PROMPT_ID = str(uuid.uuid5(NS, "prompt-jarvis-outlier-structurer"))
VERSION_ID = str(uuid.uuid5(NS, "version-jarvis-outlier-structurer-v1"))

PROMPT_CONTENT = (
    "You are JARVIS, an AI assistant for job seekers. Your task is to take a user''s "
    "free-text description of their experience with a specific skill or technology and "
    "structure it into a Story Bank entry.\n\n"
    "The Story Bank uses the Problem-Solved-Deployed (PSD) format:\n"
    "- **problem**: What challenge, need, or gap existed that required this skill?\n"
    "- **solved**: How did the user address it? What did they build, configure, or implement?\n"
    "- **deployed**: What was the outcome or impact? Metrics, adoption, improvements.\n"
    "- **takeaway**: Key learning or transferable insight.\n"
    "- **hook_line**: One compelling sentence that summarizes the experience (for interview openers).\n"
    "- **trigger_keywords**: Array of related technical terms, tools, and concepts "
    "(lowercase, used for matching this story to future job descriptions).\n\n"
    "If the user mentions a company, weave it into the narrative naturally.\n"
    "If the user mentions a repository or portfolio link, reference it in the ''deployed'' section.\n\n"
    "Return JSON only with keys: problem, solved, deployed, takeaway, hook_line, trigger_keywords.\n"
    "Be specific and concrete -- avoid generic statements. "
    "Use the user''s actual words and details as the foundation."
)


def upgrade() -> None:
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'jarvis-outlier-structurer', 'JARVIS Outlier Story Structurer', "
        f"'Structures user-provided skill experience descriptions into Story Bank PSD format', "
        f"'system', 'jarvis', '{PROMPT_CONTENT}', 'light', 0.4, 1024, true, 'published') "
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
