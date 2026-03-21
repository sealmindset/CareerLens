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

    # AI Provider -- which provider is active
    AI_PROVIDER: str = "anthropic_foundry"

    # Azure AI Foundry (when AI_PROVIDER=anthropic_foundry)
    AZURE_AI_FOUNDRY_ENDPOINT: str = ""
    AZURE_AI_FOUNDRY_API_KEY: str = ""
    ANTHROPIC_FOUNDRY_MODEL_HEAVY: str = "cogdep-aifoundry-dev-eus2-claude-opus-4-6"
    ANTHROPIC_FOUNDRY_MODEL_STANDARD: str = "cogdep-aifoundry-dev-eus2-claude-sonnet-4-5"
    ANTHROPIC_FOUNDRY_MODEL_LIGHT: str = "cogdep-aifoundry-dev-eus2-claude-haiku-4-5"

    # Direct Anthropic (when AI_PROVIDER=anthropic)
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL_HEAVY: str = "claude-opus-4-6"
    ANTHROPIC_MODEL_STANDARD: str = "claude-sonnet-4-5"
    ANTHROPIC_MODEL_LIGHT: str = "claude-haiku-4-5"

    # OpenAI (when AI_PROVIDER=openai)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL_HEAVY: str = "gpt-4o"
    OPENAI_MODEL_STANDARD: str = "gpt-4o-mini"
    OPENAI_MODEL_LIGHT: str = "gpt-4o-mini"

    # Ollama (when AI_PROVIDER=ollama -- local, no key needed)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL_HEAVY: str = "llama3.1:70b"
    OLLAMA_MODEL_STANDARD: str = "llama3.1:8b"
    OLLAMA_MODEL_LIGHT: str = "llama3.1:8b"

    # RAG / Embedding Configuration
    EMBEDDING_PROVIDER: str = "keyword"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536
    RAG_CHUNK_SIZE: int = 500
    RAG_CHUNK_OVERLAP: int = 50
    RAG_TOP_K: int = 10

    # Mock services
    MOCK_OLIVIA_URL: str = "http://mock-olivia:10091"

    # Secret enforcement
    ENFORCE_SECRETS: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def AI_MODEL_HEAVY(self) -> str:
        """Resolve heavy model based on active provider."""
        return self._model_for_tier("HEAVY")

    @property
    def AI_MODEL_STANDARD(self) -> str:
        """Resolve standard model based on active provider."""
        return self._model_for_tier("STANDARD")

    @property
    def AI_MODEL_LIGHT(self) -> str:
        """Resolve light model based on active provider."""
        return self._model_for_tier("LIGHT")

    def _model_for_tier(self, tier: str) -> str:
        provider = self.AI_PROVIDER.lower()
        if provider == "anthropic_foundry":
            return getattr(self, f"ANTHROPIC_FOUNDRY_MODEL_{tier}")
        elif provider == "anthropic":
            return getattr(self, f"ANTHROPIC_MODEL_{tier}")
        elif provider == "openai":
            return getattr(self, f"OPENAI_MODEL_{tier}")
        elif provider == "ollama":
            return getattr(self, f"OLLAMA_MODEL_{tier}")
        return getattr(self, f"ANTHROPIC_FOUNDRY_MODEL_{tier}")


settings = Settings()
