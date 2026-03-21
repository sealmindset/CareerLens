"""App settings -- database-backed configuration with audit logging

Revision ID: 010
Revises: 009
Create Date: 2026-03-20 00:00:00.000000

Adds app_settings and app_setting_audit_logs tables.
Seeds all .env settings into the database.
Adds app_settings RBAC permissions for Super Admin and Admin.
"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NS = uuid.UUID("12345678-1234-5678-1234-567812345678")

# Reuse role IDs from 003
ROLE_SUPER_ADMIN = str(uuid.uuid5(NS, "role-super-admin"))
ROLE_ADMIN = str(uuid.uuid5(NS, "role-admin"))


def _perm_id(resource: str, action: str) -> str:
    return str(uuid.uuid5(NS, f"perm-{resource}-{action}"))


def _setting_id(key: str) -> str:
    return str(uuid.uuid5(NS, f"app-setting-{key}"))


# ---------------------------------------------------------------------------
# Setting definitions: (key, group, display_name, description, value_type,
#                        is_sensitive, requires_restart, default_value)
# ---------------------------------------------------------------------------
SETTINGS = [
    # Database
    ("DATABASE_URL", "database", "Database URL",
     "PostgreSQL connection string (asyncpg)",
     "string", False, True,
     "postgresql+asyncpg://career-lens:career-lens@db:5432/career-lens"),

    # Authentication
    ("OIDC_ISSUER_URL", "authentication", "OIDC Issuer URL",
     "OpenID Connect issuer URL for authentication",
     "string", False, True, "http://mock-oidc:10090"),
    ("OIDC_CLIENT_ID", "authentication", "OIDC Client ID",
     "Client ID registered with the identity provider",
     "string", False, True, "mock-oidc-client"),
    ("OIDC_CLIENT_SECRET", "authentication", "OIDC Client Secret",
     "Client secret for OIDC authentication",
     "string", True, True, ""),

    # Security
    ("JWT_SECRET", "security", "JWT Secret",
     "Secret key for signing JWT tokens. Generate with: openssl rand -hex 32",
     "string", True, True, ""),
    ("ENFORCE_SECRETS", "security", "Enforce Secrets",
     "When true, requires all secrets to be set (production mode)",
     "bool", False, False, "false"),

    # URLs
    ("FRONTEND_URL", "urls", "Frontend URL",
     "Public URL for the frontend application",
     "string", False, True, "http://localhost:3300"),
    ("BACKEND_URL", "urls", "Backend URL",
     "Public URL for the backend API",
     "string", False, True, "http://localhost:8300"),

    # AI Provider
    ("AI_PROVIDER", "ai_provider", "AI Provider",
     "Active AI provider: anthropic_foundry, anthropic, openai, or ollama",
     "string", False, False, "anthropic_foundry"),
    ("AI_MODEL_HEAVY", "ai_provider", "Heavy Model",
     "Model for complex reasoning tasks (Tailor, Coach, Strategist agents)",
     "string", False, False, "claude-opus-4-6"),
    ("AI_MODEL_STANDARD", "ai_provider", "Standard Model",
     "Model for analysis tasks (Scout, Brand Advisor agents)",
     "string", False, False, "claude-sonnet-4-6"),
    ("AI_MODEL_LIGHT", "ai_provider", "Light Model",
     "Model for simple tasks (Coordinator agent, form filling)",
     "string", False, False, "claude-haiku-4-5"),
    ("AZURE_AI_FOUNDRY_ENDPOINT", "ai_provider", "Azure AI Foundry Endpoint",
     "Endpoint URL for Azure AI Foundry (when using anthropic_foundry provider)",
     "string", False, False, ""),
    ("AZURE_AI_FOUNDRY_API_KEY", "ai_provider", "Azure AI Foundry API Key",
     "API key for Azure AI Foundry. Falls back to DefaultAzureCredential if empty",
     "string", True, False, ""),
    ("ANTHROPIC_API_KEY", "ai_provider", "Anthropic API Key",
     "API key for direct Anthropic access (when using anthropic provider)",
     "string", True, False, ""),
    ("OPENAI_API_KEY", "ai_provider", "OpenAI API Key",
     "API key for OpenAI (when using openai provider)",
     "string", True, False, ""),
    ("OLLAMA_BASE_URL", "ai_provider", "Ollama Base URL",
     "Base URL for Ollama local inference server",
     "string", False, False, "http://localhost:11434"),

    # RAG / Embeddings
    ("EMBEDDING_PROVIDER", "rag", "Embedding Provider",
     "Embedding provider: openai (requires API key) or keyword (BM25, no key needed)",
     "string", False, False, "keyword"),
    ("EMBEDDING_MODEL", "rag", "Embedding Model",
     "Model name for embeddings (when using openai provider)",
     "string", False, False, "text-embedding-3-small"),
    ("EMBEDDING_DIMENSIONS", "rag", "Embedding Dimensions",
     "Vector dimensions for embeddings",
     "int", False, False, "1536"),
    ("RAG_CHUNK_SIZE", "rag", "Chunk Size",
     "Maximum characters per RAG chunk",
     "int", False, False, "500"),
    ("RAG_CHUNK_OVERLAP", "rag", "Chunk Overlap",
     "Character overlap between adjacent chunks",
     "int", False, False, "50"),
    ("RAG_TOP_K", "rag", "Top K Results",
     "Number of top chunks to retrieve per query",
     "int", False, False, "10"),

    # Mock Services
    ("MOCK_OLIVIA_URL", "mock_services", "Mock Olivia URL",
     "URL for the mock Paradox.ai chatbot service (local dev only)",
     "string", False, False, "http://localhost:10191"),
]


def upgrade() -> None:
    # =========================================================================
    # 1. CREATE TABLES
    # =========================================================================
    op.create_table(
        "app_settings",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("value", sa.Text, nullable=True),
        sa.Column("group_name", sa.String(60), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("value_type", sa.String(20), nullable=False, server_default="string"),
        sa.Column("is_sensitive", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("requires_restart", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("updated_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("key", name="uq_app_setting_key"),
    )
    op.create_index("ix_app_settings_key", "app_settings", ["key"])
    op.create_index("ix_app_settings_group_name", "app_settings", ["group_name"])

    op.create_table(
        "app_setting_audit_logs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("setting_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("app_settings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_value", sa.Text, nullable=True),
        sa.Column("new_value", sa.Text, nullable=True),
        sa.Column("changed_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_app_setting_audit_logs_setting_id", "app_setting_audit_logs", ["setting_id"])
    op.create_index("ix_app_setting_audit_logs_created_at", "app_setting_audit_logs", ["created_at"])

    # =========================================================================
    # 2. SEED SETTINGS
    # =========================================================================
    values = []
    for key, group, display, desc, vtype, sensitive, restart, default in SETTINGS:
        sid = _setting_id(key)
        # Escape single quotes in description
        desc_escaped = desc.replace("'", "''")
        values.append(
            f"('{sid}', '{key}', '{default}', '{group}', '{display}', "
            f"'{desc_escaped}', '{vtype}', {str(sensitive).lower()}, "
            f"{str(restart).lower()}, NULL)"
        )

    op.execute(sa.text(
        "INSERT INTO app_settings (id, key, value, group_name, display_name, "
        "description, value_type, is_sensitive, requires_restart, updated_by) VALUES "
        + ", ".join(values)
        + " ON CONFLICT (key) DO NOTHING"
    ))

    # =========================================================================
    # 3. ADD RBAC PERMISSIONS for app_settings
    # =========================================================================
    perm_view = _perm_id("app_settings", "view")
    perm_edit = _perm_id("app_settings", "edit")

    op.execute(sa.text(
        "INSERT INTO permissions (id, resource, action, description) VALUES "
        f"('{perm_view}', 'app_settings', 'view', 'Can view application settings'), "
        f"('{perm_edit}', 'app_settings', 'edit', 'Can edit application settings') "
        "ON CONFLICT (resource, action) DO NOTHING"
    ))

    # Grant to Super Admin and Admin
    op.execute(sa.text(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES "
        f"('{ROLE_SUPER_ADMIN}', '{perm_view}'), "
        f"('{ROLE_SUPER_ADMIN}', '{perm_edit}'), "
        f"('{ROLE_ADMIN}', '{perm_view}'), "
        f"('{ROLE_ADMIN}', '{perm_edit}') "
        "ON CONFLICT DO NOTHING"
    ))


def downgrade() -> None:
    perm_view = _perm_id("app_settings", "view")
    perm_edit = _perm_id("app_settings", "edit")

    op.execute(sa.text(
        f"DELETE FROM role_permissions WHERE permission_id IN ('{perm_view}', '{perm_edit}')"
    ))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE resource = 'app_settings'"
    ))
    op.drop_table("app_setting_audit_logs")
    op.drop_table("app_settings")
