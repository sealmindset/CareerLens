"""Create tasks and quick_captures tables + permissions + task-extractor prompt.

Revision ID: 032
Revises: 031
"""

import uuid

import sqlalchemy as sa
from alembic import op

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

TASK_EXTRACTOR_PROMPT_ID = str(uuid.uuid5(NS, "prompt-jarvis-task-extractor"))
TASK_EXTRACTOR_VERSION_ID = str(uuid.uuid5(NS, "version-jarvis-task-extractor-v1"))

TASK_EXTRACTOR_CONTENT = (
    "You are JARVIS, an AI assistant for job seekers. You analyze quick capture notes "
    "and extract actionable tasks.\n\n"
    "Given a raw note, determine its classification and extract tasks:\n\n"
    "## Classification\n"
    "Classify the note as ONE of:\n"
    "- **event**: Contains a scheduled meeting, interview, or call with a specific time\n"
    "- **tasks**: Contains action items, to-dos, or follow-ups without a specific meeting time\n"
    "- **info**: General information, updates, or context (no actionable tasks)\n\n"
    "## Task Extraction\n"
    "For each actionable item found, extract:\n"
    "- **title**: Clear, concise task description (imperative form: ''Follow up with...'', "
    "''Prepare for...'', ''Send...'')\n"
    "- **priority**: urgent (needs attention today), important (within 2-3 days), "
    "normal (within a week), low (when convenient)\n"
    "- **due_date**: Suggested due date in ISO format (YYYY-MM-DD). Infer from context:\n"
    "  - Follow-ups: 2-3 business days after the interaction\n"
    "  - Interview prep: 1 day before the interview\n"
    "  - Document requests: next business day\n"
    "  - General tasks: 1 week from today\n"
    "- **due_reason**: Brief explanation of why this due date (e.g., ''Interview is Thursday, "
    "prep the day before'')\n"
    "- **application_hint**: Company name or role title if the task relates to a specific "
    "opportunity (null otherwise)\n\n"
    "## Response Format\n"
    "Return JSON only:\n"
    "```json\n"
    "{{\n"
    "  \"classification\": \"event\" | \"tasks\" | \"info\",\n"
    "  \"summary\": \"One-line summary of the note\",\n"
    "  \"tasks\": [\n"
    "    {{\n"
    "      \"title\": \"...\",\n"
    "      \"priority\": \"urgent|important|normal|low\",\n"
    "      \"due_date\": \"YYYY-MM-DD\",\n"
    "      \"due_reason\": \"...\",\n"
    "      \"application_hint\": \"Company Name\" | null\n"
    "    }}\n"
    "  ]\n"
    "}}\n"
    "```\n\n"
    "IMPORTANT: The current date is {current_date}. Use this for all relative date calculations.\n"
    "If the note is classified as ''event'', still extract any non-event tasks if present.\n"
    "If ''info'' with no tasks, return an empty tasks array."
)


def upgrade() -> None:
    # -- quick_captures table --
    op.create_table(
        "quick_captures",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("raw_text", sa.Text, nullable=False),
        sa.Column("processed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_summary", sa.Text, nullable=True),
        sa.Column("extracted_tasks", sa.dialects.postgresql.JSONB, nullable=True),
        sa.Column("related_entity_type", sa.String(60), nullable=True),
        sa.Column(
            "related_entity_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_quick_captures_user_processed", "quick_captures", ["user_id", "processed"])

    # -- tasks table --
    op.create_table(
        "tasks",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "application_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("applications.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_type", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("source_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("due_reason", sa.String(500), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_tasks_user_status", "tasks", ["user_id", "status"])
    op.create_index("ix_tasks_user_due", "tasks", ["user_id", "due_date"])

    # -- Permissions --
    op.execute(sa.text(
        "INSERT INTO permissions (id, resource, action, description) VALUES "
        "(gen_random_uuid(), 'tasks', 'view', 'View tasks'), "
        "(gen_random_uuid(), 'tasks', 'create', 'Create tasks'), "
        "(gen_random_uuid(), 'tasks', 'edit', 'Edit tasks'), "
        "(gen_random_uuid(), 'tasks', 'delete', 'Delete tasks'), "
        "(gen_random_uuid(), 'quick_captures', 'view', 'View quick captures'), "
        "(gen_random_uuid(), 'quick_captures', 'create', 'Create quick captures') "
        "ON CONFLICT DO NOTHING"
    ))

    # Grant all to User role and above
    for resource in ("tasks", "quick_captures"):
        actions = ("view", "create", "edit", "delete") if resource == "tasks" else ("view", "create")
        for action in actions:
            op.execute(sa.text(
                "INSERT INTO role_permissions (role_id, permission_id) "
                "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
                f"WHERE r.name IN ('Super Admin', 'Admin', 'Pro User', 'User') "
                f"AND p.resource = '{resource}' AND p.action = '{action}' "
                "ON CONFLICT DO NOTHING"
            ))

    # -- Seed jarvis-task-extractor prompt --
    op.execute(sa.text(
        f"INSERT INTO managed_prompts (id, slug, name, description, category, agent_name, "
        f"content, model_tier, temperature, max_tokens, is_active, status) VALUES ("
        f"'{TASK_EXTRACTOR_PROMPT_ID}', 'jarvis-task-extractor', 'JARVIS Task Extractor', "
        f"'Analyzes quick capture notes and extracts actionable tasks with smart due dates', "
        f"'system', 'jarvis', '{TASK_EXTRACTOR_CONTENT}', 'light', 0.3, 2048, true, 'published') "
        f"ON CONFLICT (slug) DO NOTHING"
    ))
    op.execute(sa.text(
        f"INSERT INTO prompt_versions (id, prompt_id, version, content, change_summary, changed_by) "
        f"VALUES ('{TASK_EXTRACTOR_VERSION_ID}', '{TASK_EXTRACTOR_PROMPT_ID}', 1, "
        f"'{TASK_EXTRACTOR_CONTENT}', 'Initial system prompt', 'system') "
        f"ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    op.execute(sa.text(f"DELETE FROM prompt_versions WHERE prompt_id = '{TASK_EXTRACTOR_PROMPT_ID}'"))
    op.execute(sa.text(f"DELETE FROM managed_prompts WHERE id = '{TASK_EXTRACTOR_PROMPT_ID}'"))

    for resource in ("tasks", "quick_captures"):
        op.execute(sa.text(
            f"DELETE FROM role_permissions WHERE permission_id IN "
            f"(SELECT id FROM permissions WHERE resource = '{resource}')"
        ))
        op.execute(sa.text(f"DELETE FROM permissions WHERE resource = '{resource}'"))

    op.drop_index("ix_tasks_user_due")
    op.drop_index("ix_tasks_user_status")
    op.drop_table("tasks")
    op.drop_index("ix_quick_captures_user_processed")
    op.drop_table("quick_captures")
