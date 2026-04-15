"""Seed JARVIS managed prompts -- note-parser and shift-gears.

Revision ID: 031
Revises: 030
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

NOTE_PARSER_PROMPT_ID = str(uuid.uuid5(NS, "prompt-jarvis-note-parser"))
NOTE_PARSER_VERSION_ID = str(uuid.uuid5(NS, "version-jarvis-note-parser-v1"))

SHIFT_GEARS_PROMPT_ID = str(uuid.uuid5(NS, "prompt-jarvis-shift-gears"))
SHIFT_GEARS_VERSION_ID = str(uuid.uuid5(NS, "version-jarvis-shift-gears-v1"))

NOTE_PARSER_CONTENT = (
    "You are JARVIS, an AI assistant for job seekers. You extract structured information "
    "from quick notes about job search interactions.\n\n"
    "Given a raw note, extract ALL of the following if present:\n"
    "- contact_name: The person''s name\n"
    "- contact_email: Email if mentioned\n"
    "- role_title: Job title/position\n"
    "- company: Company name\n"
    "- location: Work location (look for city, state, ''Remote'', etc.)\n"
    "- job_type: full_time, contract, part_time, remote\n"
    "- event_type: initial_call, phone_screen, technical_interview, "
    "behavioral_interview, panel_interview, follow_up, offer_call, other\n"
    "- scheduled_time: Date/time mentioned (ISO 8601 format)\n"
    "- timezone: Timezone mentioned or implied (default to CST if unclear)\n"
    "- platform: ms_teams, zoom, google_meet, phone, in_person, webex, other\n"
    "- duration_estimate: Contract duration or meeting duration if mentioned\n"
    "- contract_details: E.g. ''9+ Month Contract'', ''potential perm in 2027''\n"
    "- source: recruiter, referral, applied, etc.\n"
    "- additional_notes: Anything else relevant\n\n"
    "IMPORTANT: The current date is {current_date}. When interpreting relative dates "
    "like ''tomorrow'' or ''next Tuesday'', use this date as reference.\n\n"
    "Return JSON only. Use null for fields not found. Include a confidence score "
    "(0-1) for each extracted field in a separate ''confidence'' object."
)

SHIFT_GEARS_CONTENT = (
    "You are JARVIS, a concise executive briefing system. The user is about to transition "
    "from their day job into an interview/call. They need a quick mental reset.\n\n"
    "Generate a ''Shift Gears'' briefing -- a 2-minute read that gets them mentally prepared.\n\n"
    "## Structure\n\n"
    "### Quick Context (30 seconds)\n"
    "- Who you''re talking to: {contact_name}\n"
    "- Company: {company} -- {one_line_company_description}\n"
    "- Role: {title} -- {one_line_match_summary}\n"
    "- Format: {platform}, {duration} minutes\n"
    "- Time: {scheduled_time} {timezone}\n\n"
    "### Your Match Story (30 seconds)\n"
    "- Top 3 reasons you''re a fit (from Scout analysis)\n"
    "- Top gap to address proactively (from gap analysis)\n"
    "- Your opening angle: one sentence that frames why you''re interested\n\n"
    "### Key Talking Points (30 seconds)\n"
    "- 3 stories from your bank most relevant to this role (hook lines only)\n"
    "- 1 question you MUST ask that shows you''ve done homework\n"
    "- The ''leave-behind'' impression you want to create\n\n"
    "### Energy Reset (30 seconds)\n"
    "- Remember: they reached out to YOU / you earned this meeting\n"
    "- Shift from {current_job_context} to {interview_persona}\n"
    "- One specific win from your career that proves you belong in this conversation\n\n"
    "Keep it punchy. No fluff. This is a pre-game warmup, not a study guide."
)


def upgrade() -> None:
    # Note Parser prompt
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{NOTE_PARSER_PROMPT_ID}', 'jarvis-note-parser', 'JARVIS Note Parser', "
        f"'System prompt for extracting structured data from quick recruiter/interview notes', "
        f"'system', 'jarvis', '{NOTE_PARSER_CONTENT}', 'light', 0.3, 2048, true, 'published') "
        f"ON CONFLICT (slug) DO NOTHING"
    ))
    op.execute(sa.text(
        f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) "
        f"VALUES ('{NOTE_PARSER_VERSION_ID}', '{NOTE_PARSER_PROMPT_ID}', 1, "
        f"'{NOTE_PARSER_CONTENT}', 'Initial system prompt', 'system') "
        f"ON CONFLICT DO NOTHING"
    ))

    # Shift Gears prompt
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{SHIFT_GEARS_PROMPT_ID}', 'jarvis-shift-gears', 'JARVIS Shift Gears Briefing', "
        f"'System prompt for generating a 2-minute pre-interview mental reset briefing', "
        f"'system', 'jarvis', '{SHIFT_GEARS_CONTENT}', 'heavy', 0.7, 4096, true, 'published') "
        f"ON CONFLICT (slug) DO NOTHING"
    ))
    op.execute(sa.text(
        f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) "
        f"VALUES ('{SHIFT_GEARS_VERSION_ID}', '{SHIFT_GEARS_PROMPT_ID}', 1, "
        f"'{SHIFT_GEARS_CONTENT}', 'Initial system prompt', 'system') "
        f"ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    op.execute(sa.text(f"DELETE FROM prompt_versions WHERE prompt_id = '{NOTE_PARSER_PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM managed_prompts WHERE id = '{NOTE_PARSER_PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM prompt_versions WHERE prompt_id = '{SHIFT_GEARS_PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM managed_prompts WHERE id = '{SHIFT_GEARS_PROMPT_ID}'"))
