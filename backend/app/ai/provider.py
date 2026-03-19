from abc import ABC, abstractmethod
from typing import AsyncIterator
from app.config import settings


class AIProvider(ABC):
    """Abstract AI provider interface."""

    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        ...

    @abstractmethod
    async def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        ...


def get_model_for_tier(tier: str) -> str:
    """Resolve model name from tier and env vars."""
    mapping = {
        "heavy": settings.AI_MODEL_HEAVY,
        "standard": settings.AI_MODEL_STANDARD,
        "light": settings.AI_MODEL_LIGHT,
    }
    return mapping.get(tier, settings.AI_MODEL_STANDARD)


def get_ai_provider() -> AIProvider:
    """Factory: returns configured AI provider based on AI_PROVIDER env var."""
    provider = settings.AI_PROVIDER.lower()
    if provider == "anthropic_foundry":
        from app.ai.providers.anthropic_foundry import AnthropicFoundryProvider

        return AnthropicFoundryProvider()
    elif provider == "anthropic":
        from app.ai.providers.anthropic_direct import AnthropicDirectProvider

        return AnthropicDirectProvider()
    elif provider == "openai":
        from app.ai.providers.openai_provider import OpenAIProvider

        return OpenAIProvider()
    elif provider == "ollama":
        from app.ai.providers.ollama_provider import OllamaProvider

        return OllamaProvider()
    else:
        raise ValueError(
            f"Unknown AI_PROVIDER: '{provider}'. "
            f"Valid options: anthropic_foundry, anthropic, openai, ollama"
        )
