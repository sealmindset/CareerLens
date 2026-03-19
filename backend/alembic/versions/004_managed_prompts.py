"""Managed prompts -- prompt management system with versioning and audit

Revision ID: 004
Revises: 003
Create Date: 2026-03-19 00:00:00.000000

Adds managed_prompts, prompt_versions, and prompt_audit_logs tables.
Seeds system prompts for all 6 AI agents and adds prompts RBAC permissions.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

# Reuse role IDs from 003
ROLE_SUPER_ADMIN = str(uuid.uuid5(NS, "role-super-admin"))
ROLE_ADMIN = str(uuid.uuid5(NS, "role-admin"))

# Prompt IDs
PROMPT_IDS = {
    "scout": str(uuid.uuid5(NS, "prompt-scout-system")),
    "tailor": str(uuid.uuid5(NS, "prompt-tailor-system")),
    "coach": str(uuid.uuid5(NS, "prompt-coach-system")),
    "strategist": str(uuid.uuid5(NS, "prompt-strategist-system")),
    "brand_advisor": str(uuid.uuid5(NS, "prompt-brand-advisor-system")),
    "coordinator": str(uuid.uuid5(NS, "prompt-coordinator-system")),
}

# Version IDs
VERSION_IDS = {k: str(uuid.uuid5(NS, f"version-{k}-v1")) for k in PROMPT_IDS}


def _perm_id(resource: str, action: str) -> str:
    return str(uuid.uuid5(NS, f"perm-{resource}-{action}"))


PROMPTS = {
    "scout": {
        "slug": "scout-system",
        "name": "Scout System Prompt",
        "description": "System prompt for the Scout agent -- job analysis and matching",
        "model_tier": "standard",
        "content": (
            "You are Scout, a career research specialist for CareerLens. "
            "Your role is to analyze job listings against the user's profile, identify strong matches, "
            "discover hidden opportunities, and provide match scores with detailed explanations.\n\n"
            "When analyzing a job listing, compare requirements against the user's skills, experience, "
            "and education. Highlight strengths, identify gaps, and suggest how to position the application.\n\n"
            "Be specific and actionable in your advice. Use markdown formatting for readability.\n\n"
            "When providing match scores, use a scale of 0-100 and explain the breakdown:\n"
            "- Skills match\n- Experience match\n- Education match\n- Culture/values alignment"
        ),
    },
    "tailor": {
        "slug": "tailor-system",
        "name": "Tailor System Prompt",
        "description": "System prompt for the Tailor agent -- resume and cover letter optimization",
        "model_tier": "heavy",
        "content": (
            "You are Tailor, a resume and cover letter specialist for CareerLens. "
            "Your role is to rewrite resumes and cover letters to authentically match the language, "
            "keywords, and requirements of specific job listings.\n\n"
            "IMPORTANT RULES:\n"
            "- NEVER fabricate experience, skills, or achievements\n"
            "- Reframe existing experience to highlight relevant skills\n"
            "- Preserve the user's authentic voice\n"
            "- Optimize for ATS (Applicant Tracking Systems)\n"
            "- Quantify achievements where possible\n"
            "- Use action verbs and industry-specific terminology\n\n"
            "Use markdown formatting. When presenting a tailored version, show the changes clearly."
        ),
    },
    "coach": {
        "slug": "coach-system",
        "name": "Coach System Prompt",
        "description": "System prompt for the Coach agent -- interview preparation",
        "model_tier": "standard",
        "content": (
            "You are Coach, an interview preparation specialist for CareerLens. "
            "Your role is to prepare users for interviews with targeted practice questions, "
            "feedback on answers, and gap analysis.\n\n"
            "APPROACH:\n"
            "1. Ask behavioral and technical questions relevant to the target role\n"
            "2. Provide constructive feedback using the STAR method (Situation, Task, Action, Result)\n"
            "3. Identify weak areas and suggest improvement strategies\n"
            "4. Simulate different interview formats (behavioral, technical, case study)\n\n"
            "Be encouraging but honest. If an answer needs improvement, explain specifically what to change."
        ),
    },
    "strategist": {
        "slug": "strategist-system",
        "name": "Strategist System Prompt",
        "description": "System prompt for the Strategist agent -- career planning and negotiation",
        "model_tier": "heavy",
        "content": (
            "You are Strategist, a career planning advisor for CareerLens. "
            "Your role is to advise on career moves, salary negotiation, and long-term career planning.\n\n"
            "CAPABILITIES:\n"
            "- Analyze market trends and compensation benchmarks\n"
            "- Evaluate job offers and career trajectories\n"
            "- Advise on career transitions and skill development\n"
            "- Help with salary and benefits negotiation\n"
            "- Set professional goals and milestones\n\n"
            "Be data-informed when possible and transparent when speculating. "
            "Always distinguish between facts and estimates."
        ),
    },
    "brand_advisor": {
        "slug": "brand-advisor-system",
        "name": "Brand Advisor System Prompt",
        "description": "System prompt for the Brand Advisor agent -- personal branding",
        "model_tier": "standard",
        "content": (
            "You are Brand Advisor, a personal branding specialist for CareerLens. "
            "Your role is to improve the user's LinkedIn profile, online presence, and personal brand strategy.\n\n"
            "FOCUS AREAS:\n"
            "- LinkedIn headline and summary optimization\n"
            "- Experience description improvements\n"
            "- Content strategy and posting recommendations\n"
            "- Networking advice and visibility tactics\n"
            "- Portfolio and project showcase guidance\n\n"
            "Focus on authenticity and professional differentiation. "
            "Help the user stand out without being inauthentic."
        ),
    },
    "coordinator": {
        "slug": "coordinator-system",
        "name": "Coordinator System Prompt",
        "description": "System prompt for the Coordinator agent -- application pipeline management",
        "model_tier": "light",
        "content": (
            "You are Coordinator, an application process manager for CareerLens. "
            "Your role is to orchestrate the application process: help organize applications, "
            "track deadlines, plan follow-ups, and manage the pipeline.\n\n"
            "CAPABILITIES:\n"
            "- Provide reminders and suggest next actions\n"
            "- Help prioritize applications based on match scores and deadlines\n"
            "- Track application statuses and follow-up dates\n"
            "- Suggest optimal timing for follow-ups\n"
            "- Create action plans for complex applications\n\n"
            "Be organized, systematic, and proactive about deadlines."
        ),
    },
}


def upgrade() -> None:
    # --- Add "general" to context_type enum ---
    # Must run outside transaction for ALTER TYPE ... ADD VALUE
    op.execute(sa.text("COMMIT"))
    op.execute(sa.text("ALTER TYPE context_type ADD VALUE IF NOT EXISTS 'general'"))
    op.execute(sa.text("BEGIN"))

    # --- Enums ---
    op.execute(sa.text("DO $$ BEGIN CREATE TYPE prompt_category AS ENUM ('system', 'user', 'template'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"))
    op.execute(sa.text("DO $$ BEGIN CREATE TYPE prompt_status AS ENUM ('draft', 'testing', 'published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$"))

    # --- managed_prompts ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS managed_prompts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            slug VARCHAR(120) UNIQUE NOT NULL,
            name VARCHAR(200) NOT NULL,
            description TEXT,
            category prompt_category NOT NULL DEFAULT 'system',
            agent_name VARCHAR(60),
            content TEXT NOT NULL,
            model_tier VARCHAR(20) NOT NULL DEFAULT 'standard',
            temperature FLOAT NOT NULL DEFAULT 0.3,
            max_tokens INTEGER NOT NULL DEFAULT 2048,
            is_active BOOLEAN NOT NULL DEFAULT true,
            status prompt_status NOT NULL DEFAULT 'published',
            updated_by VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_managed_prompts_agent_name ON managed_prompts (agent_name)"))

    # --- prompt_versions ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            prompt_id UUID NOT NULL REFERENCES managed_prompts(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            content TEXT NOT NULL,
            change_summary VARCHAR(500),
            changed_by VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (prompt_id, version)
        )
    """))

    # --- prompt_audit_logs ---
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS prompt_audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            prompt_id UUID NOT NULL REFERENCES managed_prompts(id) ON DELETE CASCADE,
            action VARCHAR(20) NOT NULL,
            risk_flag BOOLEAN NOT NULL DEFAULT false,
            warnings TEXT,
            blocked_reasons TEXT,
            changed_by VARCHAR(255),
            content_snapshot TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_prompt_audit_logs_prompt_id ON prompt_audit_logs (prompt_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_prompt_audit_logs_created_at ON prompt_audit_logs (created_at)"))

    # --- Seed prompts ---
    for agent, config in PROMPTS.items():
        pid = PROMPT_IDS[agent]
        escaped_content = config["content"].replace("'", "''")
        escaped_desc = config["description"].replace("'", "''")
        op.execute(sa.text(
            f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
            f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
            f"'{pid}', '{config['slug']}', '{config['name']}', '{escaped_desc}', "
            f"'system', '{agent}', '{escaped_content}', '{config['model_tier']}', "
            f"0.3, 2048, true, 'published') ON CONFLICT (slug) DO NOTHING"
        ))
        # Seed version 1
        vid = VERSION_IDS[agent]
        op.execute(sa.text(
            f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) VALUES ("
            f"'{vid}', '{pid}', 1, '{escaped_content}', 'Initial system prompt', 'system') "
            f"ON CONFLICT DO NOTHING"
        ))

    # --- Add prompts permissions ---
    perm_actions = ["view", "edit"]
    perm_values = []
    for action in perm_actions:
        pid = _perm_id("prompts", action)
        desc = f"Can {action} prompts"
        perm_values.append(f"('{pid}', 'prompts', '{action}', '{desc}')")

    op.execute(sa.text(
        "INSERT INTO permissions (id, resource, action, description) VALUES "
        + ", ".join(perm_values)
        + " ON CONFLICT (resource, action) DO NOTHING"
    ))

    # Grant prompt permissions to Super Admin and Admin
    rp_values = []
    for action in perm_actions:
        pid = _perm_id("prompts", action)
        rp_values.append(f"('{ROLE_SUPER_ADMIN}', '{pid}')")
        rp_values.append(f"('{ROLE_ADMIN}', '{pid}')")

    op.execute(sa.text(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES "
        + ", ".join(rp_values)
        + " ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    op.drop_table("prompt_audit_logs")
    op.drop_table("prompt_versions")
    op.drop_table("managed_prompts")
    # Remove prompts permissions
    op.execute(sa.text("DELETE FROM role_permissions WHERE permission_id IN ("
        f"'{_perm_id('prompts', 'view')}', '{_perm_id('prompts', 'edit')}')"))
    op.execute(sa.text("DELETE FROM permissions WHERE resource = 'prompts'"))
    sa.Enum(name="prompt_category").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="prompt_status").drop(op.get_bind(), checkfirst=True)
