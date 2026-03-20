from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # OIDC
    OIDC_ISSUER_URL: str = "http://mock-oidc:10090"
    OIDC_CLIENT_ID: str = "mock-oidc-client"
    OIDC_CLIENT_SECRET: str = "mock-oidc-secret"
    # JWT
    JWT_SECRET: str = "change-me-in-production"
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://career-lens:career-lens@db:5432/career-lens"
    # URLs
    FRONTEND_URL: str = "http://localhost:3300"
    BACKEND_URL: str = "http://localhost:8300"
    # [ADDITIONAL_SERVICE_URLS] -- e.g., JIRA_BASE_URL, TEMPO_BASE_URL

    # AI Provider
    AI_PROVIDER: str = "anthropic_foundry"
    AI_MODEL_HEAVY: str = "cogdep-aifoundry-dev-eus2-claude-opus-4-6"
    AI_MODEL_STANDARD: str = "cogdep-aifoundry-dev-eus2-claude-sonnet-4-5"
    AI_MODEL_LIGHT: str = "cogdep-aifoundry-dev-eus2-claude-haiku-4-5"

    # Azure AI Foundry (when AI_PROVIDER=anthropic_foundry)
    # Uses API key if provided, otherwise falls back to DefaultAzureCredential
    AZURE_AI_FOUNDRY_ENDPOINT: str = ""
    AZURE_AI_FOUNDRY_API_KEY: str = ""

    # Direct Anthropic (when AI_PROVIDER=anthropic)
    ANTHROPIC_API_KEY: str = ""

    # OpenAI (when AI_PROVIDER=openai)
    OPENAI_API_KEY: str = ""

    # Ollama (when AI_PROVIDER=ollama)
    OLLAMA_BASE_URL: str = "http://localhost:11434"

    # Secret enforcement
    ENFORCE_SECRETS: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
