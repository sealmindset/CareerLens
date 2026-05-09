"""Add Translation Coach: tables, seed questions, managed prompt, permissions.

Revision ID: 046
Revises: 045
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "046"
down_revision = "045"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

PROMPT_ID = str(uuid.uuid5(NS, "prompt-translation-coach-system"))
VERSION_ID = str(uuid.uuid5(NS, "version-translation-coach-system-v1"))

PROMPT_CONTENT = (
    "You are Translation Coach, a communication specialist for CareerLens.\\n\\n"
    "Your job is to evaluate an interview answer for ''business translation'' -- "
    "whether the speaker converts technical jargon into business-value language.\\n\\n"
    "## SCORING DIMENSIONS (weighted booleans)\\n\\n"
    "Evaluate EACH dimension as true/false:\\n"
    "- led_with_problem (0.25): Did the answer open with a business problem or context, "
    "rather than jumping to a technical solution or tool?\\n"
    "- business_outcome_present (0.25): Does the answer mention at least one business outcome "
    "(cost savings, time reduction, risk mitigation, revenue)?\\n"
    "- jargon_translated (0.20): Are technical terms accompanied by plain-English equivalents "
    "or business-framed explanations?\\n"
    "- used_employers_language (0.15): Does the answer mirror terminology from the job "
    "description (if provided)? If no JD provided, mark true.\\n"
    "- quantified_impact (0.15): Does the answer include a concrete number, percentage, "
    "or comparison?\\n\\n"
    "## FLAGGED PHRASES\\n\\n"
    "Identify 0-5 jargon phrases in the original answer. For each, provide:\\n"
    "- The exact phrase as written (case-sensitive, verbatim)\\n"
    "- A business-language replacement suggestion\\n"
    "- Character start and end indices in the original text\\n\\n"
    "## TRANSLATED VERSION\\n\\n"
    "Rewrite the entire answer in business-value language. Preserve the candidate''s intent "
    "and facts. Write in first person, in the candidate''s voice -- not as a template with "
    "brackets. Lead with the problem. Quantify outcomes. Remove jargon.\\n\\n"
    "## COACHING NOTE\\n\\n"
    "Write exactly 2 sentences of actionable coaching. Be specific, not generic.\\n\\n"
    "## OUTPUT FORMAT\\n\\n"
    "Return EXACTLY ONE JSON object. No markdown fences. No preamble. No explanation.\\n"
    "{\\n"
    "  ''led_with_problem'': true/false,\\n"
    "  ''business_outcome_present'': true/false,\\n"
    "  ''jargon_translated'': true/false,\\n"
    "  ''used_employers_language'': true/false,\\n"
    "  ''quantified_impact'': true/false,\\n"
    "  ''flagged_phrases'': [{''original'': ''...'', ''suggested'': ''...'', "
    "''start_idx'': 0, ''end_idx'': 10}],\\n"
    "  ''translated_version'': ''...'',\\n"
    "  ''coaching_note'': ''...''\\n"
    "}\\n\\n"
    "CRITICAL: Never invent facts. Only work with what the user provided. "
    "Be specific in flagged_phrases -- identify exact quoted phrases, not paraphrases."
)

QUESTIONS = [
    # experience_background
    ("experience_background", "Tell me about yourself and what draws you to this role.", "medium", 0),
    ("experience_background", "Walk me through the most impactful security or AI initiative you've led.", "medium", 1),
    ("experience_background", "Describe a time you had to rearchitect a system under production pressure.", "hard", 2),
    ("experience_background", "What's your approach when inheriting a legacy security posture with known gaps?", "medium", 3),
    # ai_architecture
    ("ai_architecture", "How would you explain your AI governance strategy to a CFO who's nervous about risk?", "hard", 4),
    ("ai_architecture", "A CISO asks why you chose to build an internal AI capability instead of buying. Walk them through your reasoning.", "hard", 5),
    ("ai_architecture", "Describe how you've scaled an AI/ML solution from proof-of-concept to enterprise-wide deployment.", "medium", 6),
    ("ai_architecture", "How do you evaluate and communicate the ROI of a zero-trust architecture investment?", "hard", 7),
    # leadership_influence
    ("leadership_influence", "Tell me about a time you killed a project that the team was emotionally attached to.", "hard", 8),
    ("leadership_influence", "How do you get buy-in from a skeptical VP who's been burned by past AI promises?", "hard", 9),
    ("leadership_influence", "Describe how you prioritize competing security initiatives when the board wants everything done yesterday.", "medium", 10),
    ("leadership_influence", "Walk me through how you'd communicate a data breach to non-technical executives in the first 24 hours.", "hard", 11),
]


def upgrade() -> None:
    # --- Enum ---
    op.execute("ALTER TYPE agent_name ADD VALUE IF NOT EXISTS 'translation_coach'")

    # --- Tables ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS translation_questions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            category VARCHAR(50) NOT NULL,
            question_text TEXT NOT NULL,
            difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
            hint TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS translation_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            job_description TEXT,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at TIMESTAMPTZ,
            question_count INTEGER NOT NULL DEFAULT 0,
            avg_drift_score FLOAT
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS translation_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES translation_sessions(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            question_id UUID REFERENCES translation_questions(id) ON DELETE SET NULL,
            custom_question TEXT,
            original_answer TEXT NOT NULL,
            drift_score FLOAT NOT NULL,
            signal VARCHAR(10) NOT NULL,
            scoring_breakdown JSONB NOT NULL,
            flagged_phrases JSONB,
            translated_version TEXT,
            coaching_note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    # --- Indexes ---
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_translation_sessions_user "
        "ON translation_sessions (user_id, started_at DESC)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_translation_attempts_session "
        "ON translation_attempts (session_id, created_at ASC)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_translation_attempts_user "
        "ON translation_attempts (user_id, created_at DESC)"
    ))

    # --- Seed questions ---
    for cat, text, diff, order in QUESTIONS:
        qid = str(uuid.uuid5(NS, f"translation-q-{order}"))
        escaped = text.replace("'", "''")
        op.execute(sa.text(
            f"INSERT INTO translation_questions (id, category, question_text, difficulty, sort_order) "
            f"VALUES ('{qid}', '{cat}', '{escaped}', '{diff}', {order}) "
            f"ON CONFLICT (id) DO NOTHING"
        ))

    # --- Managed prompt ---
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{PROMPT_ID}', 'translation-coach-system', 'Translation Coach System Prompt', "
        f"'Evaluates interview answers for business-value translation vs technical jargon drift', "
        f"'system', 'translation_coach', '{PROMPT_CONTENT}', 'standard', 0.3, 2048, true, 'published') "
        f"ON CONFLICT (slug) DO NOTHING"
    ))
    op.execute(sa.text(
        f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) "
        f"VALUES ('{VERSION_ID}', '{PROMPT_ID}', 1, "
        f"'{PROMPT_CONTENT}', 'Initial system prompt', 'system') "
        f"ON CONFLICT DO NOTHING"
    ))

    # --- Permissions ---
    op.execute(sa.text("""
        INSERT INTO permissions (id, resource, action, description)
        VALUES
            (gen_random_uuid(), 'translation_coach', 'use', 'Use Translation Coach'),
            (gen_random_uuid(), 'translation_coach', 'view', 'View Translation Coach history')
        ON CONFLICT DO NOTHING
    """))

    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT rp.role_id, p.id
        FROM permissions p
        CROSS JOIN (
            SELECT DISTINCT role_id FROM role_permissions rp2
            JOIN permissions p2 ON rp2.permission_id = p2.id
            WHERE p2.resource = 'stories'
        ) rp
        WHERE p.resource = 'translation_coach'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE resource = 'translation_coach')"
    ))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE resource = 'translation_coach'"
    ))
    op.execute(sa.text(f"DELETE FROM prompt_versions WHERE prompt_id = '{PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM managed_prompts WHERE id = '{PROMPT_ID}'"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_translation_attempts_user"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_translation_attempts_session"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_translation_sessions_user"))
    op.execute(sa.text("DROP TABLE IF EXISTS translation_attempts"))
    op.execute(sa.text("DROP TABLE IF EXISTS translation_sessions"))
    op.execute(sa.text("DROP TABLE IF EXISTS translation_questions"))
