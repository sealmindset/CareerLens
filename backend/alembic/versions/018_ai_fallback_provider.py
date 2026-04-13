"""Add AI_FALLBACK_PROVIDER setting

Revision ID: 018
Revises: 017
Create Date: 2026-04-12 00:00:00.000000

Adds AI_FALLBACK_PROVIDER to app_settings so admins can configure
automatic failover to a secondary AI provider when the primary fails.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")


def _setting_id(key: str) -> str:
    return str(uuid.uuid5(NS, f"app-setting-{key}"))


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO app_settings (id, key, value, group_name, display_name, "
            "description, value_type, is_sensitive, requires_restart) "
            "VALUES (CAST(:id AS uuid), :key, :value, :group, :display, :desc, "
            ":vtype, :sensitive, :restart) "
            "ON CONFLICT (key) DO NOTHING"
        ).bindparams(
            id=_setting_id("AI_FALLBACK_PROVIDER"),
            key="AI_FALLBACK_PROVIDER",
            value="",
            group="ai_provider",
            display="Fallback AI Provider",
            desc=(
                "Secondary AI provider tried when the primary fails. "
                "Options: anthropic_foundry, anthropic, openai, ollama. "
                "Leave blank to disable fallback."
            ),
            vtype="string",
            sensitive=False,
            restart=False,
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM app_settings WHERE key = :key"
        ).bindparams(key="AI_FALLBACK_PROVIDER")
    )
