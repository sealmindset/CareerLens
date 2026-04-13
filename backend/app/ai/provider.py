import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator

from app.config import settings

logger = logging.getLogger(__name__)


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


class FallbackAIProvider(AIProvider):
    """Wraps a primary provider and falls back to a secondary on failure."""

    def __init__(self, primary: AIProvider, fallback: AIProvider, fallback_name: str):
        self._primary = primary
        self._fallback = fallback
        self._fallback_name = fallback_name

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        try:
            return await self._primary.complete(
                system_prompt, user_prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
            )
        except Exception as exc:
            logger.warning(
                "Primary AI provider failed (%s), falling back to %s",
                exc, self._fallback_name,
            )
            return await self._fallback.complete(
                system_prompt, user_prompt, model=None,
                temperature=temperature, max_tokens=max_tokens,
            )

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096) -> AsyncIterator[str]:
        try:
            async for chunk in self._primary.stream(
                system_prompt, user_prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
            ):
                yield chunk
        except Exception as exc:
            logger.warning(
                "Primary AI provider stream failed (%s), falling back to %s",
                exc, self._fallback_name,
            )
            async for chunk in self._fallback.stream(
                system_prompt, user_prompt, model=None,
                temperature=temperature, max_tokens=max_tokens,
            ):
                yield chunk


def get_model_for_tier(tier: str) -> str:
    """Resolve model name from tier and env vars."""
    mapping = {
        "heavy": settings.AI_MODEL_HEAVY,
        "standard": settings.AI_MODEL_STANDARD,
        "light": settings.AI_MODEL_LIGHT,
    }
    return mapping.get(tier, settings.AI_MODEL_STANDARD)


def _create_provider(name: str) -> AIProvider:
    """Create a single provider instance by name."""
    name = name.lower().strip()
    if name == "anthropic_foundry":
        from app.ai.providers.anthropic_foundry import AnthropicFoundryProvider
        return AnthropicFoundryProvider()
    elif name == "anthropic":
        from app.ai.providers.anthropic_direct import AnthropicDirectProvider
        return AnthropicDirectProvider()
    elif name == "openai":
        from app.ai.providers.openai_provider import OpenAIProvider
        return OpenAIProvider()
    elif name == "ollama":
        from app.ai.providers.ollama_provider import OllamaProvider
        return OllamaProvider()
    else:
        raise ValueError(
            f"Unknown AI provider: '{name}'. "
            f"Valid options: anthropic_foundry, anthropic, openai, ollama"
        )


def get_ai_provider() -> AIProvider:
    """Factory: returns configured AI provider, optionally wrapped with fallback."""
    primary = _create_provider(settings.AI_PROVIDER)

    fallback_name = settings.AI_FALLBACK_PROVIDER.strip()
    if fallback_name and fallback_name.lower() != settings.AI_PROVIDER.lower():
        try:
            fallback = _create_provider(fallback_name)
            return FallbackAIProvider(primary, fallback, fallback_name)
        except ValueError:
            logger.warning("Invalid AI_FALLBACK_PROVIDER '%s', skipping fallback", fallback_name)

    return primary
