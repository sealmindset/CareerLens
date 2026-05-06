from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://career-lens:career-lens@db:5432/career-lens"

    # CareerLens backend (for profile/job context and artifact export)
    CAREERLENS_BACKEND_URL: str = "http://backend:8000"

    # JWT -- shared secret with CareerLens backend
    JWT_SECRET: str = "change-me-in-production"

    # Kokoro TTS
    KOKORO_TTS_URL: str = "http://kokoro-tts:8880"
    KOKORO_TTS_VOICE: str = "af_bella"
    KOKORO_TTS_ENABLED: bool = True

    # AI Provider -- prefers Ollama (Gemma 4 26B MoE) for zero cost
    AI_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    OLLAMA_MODEL: str = "gemma4:26b"
    OLLAMA_AUTO_PULL: bool = True

    # Fallback AI providers
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL_STANDARD: str = "claude-sonnet-4-5"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL_STANDARD: str = "gpt-4o-mini"

    # Interview defaults
    MAX_QUESTIONS_PER_SESSION: int = 20
    DEFAULT_QUESTION_COUNT: int = 10
    SILENCE_THRESHOLD_MS: int = 5000
    RAMBLE_THRESHOLD_S: int = 120
    MAX_CONCURRENT_SESSIONS_PER_USER: int = 5

    # Whisper STT (fallback for non-Chrome browsers)
    WHISPER_STT_URL: str = "http://whisper-stt:8000"
    WHISPER_STT_ENABLED: bool = True

    # CORS
    FRONTEND_URL: str = "http://localhost:3300"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
