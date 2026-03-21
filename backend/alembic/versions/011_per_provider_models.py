"""Per-provider model settings and AI Provider UI revamp

Revision ID: 011
Revises: 010
Create Date: 2026-03-21 00:00:00.000000

Replaces generic AI_MODEL_HEAVY/STANDARD/LIGHT with per-provider model
settings. Each provider (Foundry, Anthropic, OpenAI, Ollama) stores its
own model assignments for heavy/standard/light tiers. The active
AI_PROVIDER determines which models are used at runtime.

Also fixes AZURE_AI_FOUNDRY_ENDPOINT seed value and removes the old
generic AI_MODEL_* settings from the database.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")


def _setting_id(key: str) -> str:
    return str(uuid.uuid5(NS, f"app-setting-{key}"))


# New per-provider model settings
# (key, group, display_name, description, value_type, is_sensitive, requires_restart, default_value)
NEW_SETTINGS = [
    # Anthropic Foundry models
    ("ANTHROPIC_FOUNDRY_MODEL_HEAVY", "ai_provider", "Foundry Heavy Model",
     "Azure AI Foundry deployment name for complex reasoning tasks",
     "string", False, False, "cogdep-aifoundry-dev-eus2-claude-opus-4-6"),
    ("ANTHROPIC_FOUNDRY_MODEL_STANDARD", "ai_provider", "Foundry Standard Model",
     "Azure AI Foundry deployment name for analysis tasks",
     "string", False, False, "cogdep-aifoundry-dev-eus2-claude-sonnet-4-5"),
    ("ANTHROPIC_FOUNDRY_MODEL_LIGHT", "ai_provider", "Foundry Light Model",
     "Azure AI Foundry deployment name for simple tasks",
     "string", False, False, "cogdep-aifoundry-dev-eus2-claude-haiku-4-5"),
    # Anthropic direct API models
    ("ANTHROPIC_MODEL_HEAVY", "ai_provider", "Anthropic Heavy Model",
     "Anthropic API model for complex reasoning tasks",
     "string", False, False, "claude-opus-4-6"),
    ("ANTHROPIC_MODEL_STANDARD", "ai_provider", "Anthropic Standard Model",
     "Anthropic API model for analysis tasks",
     "string", False, False, "claude-sonnet-4-5"),
    ("ANTHROPIC_MODEL_LIGHT", "ai_provider", "Anthropic Light Model",
     "Anthropic API model for simple tasks",
     "string", False, False, "claude-haiku-4-5"),
    # OpenAI models
    ("OPENAI_MODEL_HEAVY", "ai_provider", "OpenAI Heavy Model",
     "OpenAI model for complex reasoning tasks",
     "string", False, False, "gpt-4o"),
    ("OPENAI_MODEL_STANDARD", "ai_provider", "OpenAI Standard Model",
     "OpenAI model for analysis tasks",
     "string", False, False, "gpt-4o-mini"),
    ("OPENAI_MODEL_LIGHT", "ai_provider", "OpenAI Light Model",
     "OpenAI model for simple tasks",
     "string", False, False, "gpt-4o-mini"),
    # Ollama models
    ("OLLAMA_MODEL_HEAVY", "ai_provider", "Ollama Heavy Model",
     "Ollama model for complex reasoning tasks",
     "string", False, False, "llama3.1:70b"),
    ("OLLAMA_MODEL_STANDARD", "ai_provider", "Ollama Standard Model",
     "Ollama model for analysis tasks",
     "string", False, False, "llama3.1:8b"),
    ("OLLAMA_MODEL_LIGHT", "ai_provider", "Ollama Light Model",
     "Ollama model for simple tasks",
     "string", False, False, "llama3.1:8b"),
]

# Old generic model settings to remove
OLD_KEYS = ["AI_MODEL_HEAVY", "AI_MODEL_STANDARD", "AI_MODEL_LIGHT"]


def upgrade() -> None:
    # Insert new per-provider model settings
    for key, group, display, desc, vtype, sensitive, restart, default in NEW_SETTINGS:
        op.execute(
            sa.text(
                "INSERT INTO app_settings (id, key, value, group_name, display_name, "
                "description, value_type, is_sensitive, requires_restart) "
                "VALUES (CAST(:id AS uuid), :key, :value, :group, :display, :desc, :vtype, "
                ":sensitive, :restart) "
                "ON CONFLICT (key) DO NOTHING"
            ).bindparams(
                id=_setting_id(key),
                key=key,
                value=default,
                group=group,
                display=display,
                desc=desc,
                vtype=vtype,
                sensitive=sensitive,
                restart=restart,
            )
        )

    # Remove old generic AI_MODEL_* settings
    for key in OLD_KEYS:
        op.execute(
            sa.text("DELETE FROM app_settings WHERE key = :key").bindparams(key=key)
        )

    # Fix AZURE_AI_FOUNDRY_ENDPOINT seed value to match .env
    op.execute(
        sa.text(
            "UPDATE app_settings SET value = :val WHERE key = 'AZURE_AI_FOUNDRY_ENDPOINT'"
        ).bindparams(val="https://snapistg-scus.azure.sleepnumber.com/anthropic")
    )

    # Fix AI_PROVIDER seed value
    op.execute(
        sa.text(
            "UPDATE app_settings SET value = :val WHERE key = 'AI_PROVIDER'"
        ).bindparams(val="anthropic_foundry")
    )


def downgrade() -> None:
    # Remove per-provider model settings
    for key, *_ in NEW_SETTINGS:
        op.execute(
            sa.text("DELETE FROM app_settings WHERE key = :key").bindparams(key=key)
        )

    # Re-insert generic AI_MODEL_* settings
    generics = [
        ("AI_MODEL_HEAVY", "Heavy Model", "Model for complex reasoning tasks",
         "claude-opus-4-6"),
        ("AI_MODEL_STANDARD", "Standard Model", "Model for analysis tasks",
         "claude-sonnet-4-6"),
        ("AI_MODEL_LIGHT", "Light Model", "Model for simple tasks",
         "claude-haiku-4-5"),
    ]
    for key, display, desc, default in generics:
        op.execute(
            sa.text(
                "INSERT INTO app_settings (id, key, value, group_name, display_name, "
                "description, value_type, is_sensitive, requires_restart) "
                "VALUES (CAST(:id AS uuid), :key, :value, 'ai_provider', :display, :desc, "
                "'string', false, false) ON CONFLICT (key) DO NOTHING"
            ).bindparams(
                id=_setting_id(key), key=key, value=default,
                display=display, desc=desc,
            )
        )
