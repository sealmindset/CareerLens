import logging
import time
from abc import ABC, abstractmethod
from typing import AsyncIterator

import httpx

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


class SmartRoutingProvider(AIProvider):
    """Routes light/standard tiers to a local MLX provider, heavy to cloud."""

    def __init__(self, cloud: AIProvider, local: AIProvider):
        self._cloud = cloud
        self._local = local
        self._cloud_to_local: dict[str, str] = {}
        self._heavy_models: set[str] = set()
        self._mlx_healthy: bool = True
        self._last_health_check: float = 0.0
        self._build_routing_table()

    def _build_routing_table(self):
        prefixes = [
            "ANTHROPIC_FOUNDRY_MODEL_",
            "ANTHROPIC_MODEL_",
            "OPENAI_MODEL_",
            "OLLAMA_MODEL_",
        ]
        for prefix in prefixes:
            heavy = getattr(settings, f"{prefix}HEAVY", None)
            standard = getattr(settings, f"{prefix}STANDARD", None)
            light = getattr(settings, f"{prefix}LIGHT", None)
            if heavy:
                self._heavy_models.add(heavy)
            if standard:
                self._cloud_to_local[standard] = settings.MLX_MODEL_STANDARD
            if light:
                self._cloud_to_local[light] = settings.MLX_MODEL_LIGHT

    async def _is_mlx_healthy(self) -> bool:
        if self._mlx_healthy:
            return True
        now = time.time()
        if now - self._last_health_check < settings.MLX_HEALTH_CHECK_INTERVAL:
            return False
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{settings.MLX_BASE_URL.rstrip('/')}/v1/models")
                if resp.status_code == 200:
                    self._mlx_healthy = True
                    logger.info("MLX server recovered")
                    return True
        except Exception:
            pass
        self._last_health_check = now
        return False

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        if model is None or model in self._heavy_models or model not in self._cloud_to_local:
            return await self._cloud.complete(
                system_prompt, user_prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
            )

        mlx_model = self._cloud_to_local[model]
        if not await self._is_mlx_healthy():
            logger.info("MLX unhealthy, routing to cloud for %s", model)
            return await self._cloud.complete(
                system_prompt, user_prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
            )

        try:
            return await self._local.complete(
                system_prompt, user_prompt, model=mlx_model,
                temperature=temperature, max_tokens=max_tokens,
            )
        except Exception as exc:
            logger.warning("MLX failed for %s (%s), falling back to cloud: %s", model, mlx_model, exc)
            self._mlx_healthy = False
            self._last_health_check = time.time()
            return await self._cloud.complete(
                system_prompt, user_prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
            )

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        if model is None or model in self._heavy_models or model not in self._cloud_to_local:
            async for chunk in self._cloud.stream(
                system_prompt, user_prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
            ):
                yield chunk
            return

        mlx_model = self._cloud_to_local[model]
        if not await self._is_mlx_healthy():
            logger.info("MLX unhealthy, routing stream to cloud for %s", model)
            async for chunk in self._cloud.stream(
                system_prompt, user_prompt, model=model,
                temperature=temperature, max_tokens=max_tokens,
            ):
                yield chunk
            return

        try:
            async for chunk in self._local.stream(
                system_prompt, user_prompt, model=mlx_model,
                temperature=temperature, max_tokens=max_tokens,
            ):
                yield chunk
        except Exception as exc:
            logger.warning("MLX stream failed for %s (%s), falling back to cloud: %s", model, mlx_model, exc)
            self._mlx_healthy = False
            self._last_health_check = time.time()
            async for chunk in self._cloud.stream(
                system_prompt, user_prompt, model=model,
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
    elif name == "mlx":
        from app.ai.providers.mlx_provider import MLXProvider
        return MLXProvider()
    else:
        raise ValueError(
            f"Unknown AI provider: '{name}'. "
            f"Valid options: anthropic_foundry, anthropic, openai, ollama, mlx"
        )


_cached_provider: AIProvider | None = None


def get_ai_provider() -> AIProvider:
    """Factory: returns a cached AI provider singleton.

    The singleton keeps SmartRoutingProvider's _mlx_healthy state alive so that
    a single failed MLX health-check prevents retries on every call (instead of
    creating a new provider and retrying the dead connection each time).
    """
    global _cached_provider
    if _cached_provider is not None:
        return _cached_provider

    primary = _create_provider(settings.AI_PROVIDER)

    fallback_name = settings.AI_FALLBACK_PROVIDER.strip()
    if fallback_name and fallback_name.lower() != settings.AI_PROVIDER.lower():
        try:
            fallback = _create_provider(fallback_name)
            primary = FallbackAIProvider(primary, fallback, fallback_name)
        except ValueError:
            logger.warning("Invalid AI_FALLBACK_PROVIDER '%s', skipping fallback", fallback_name)

    if settings.MLX_ENABLED:
        try:
            from app.ai.providers.mlx_provider import MLXProvider
            mlx = MLXProvider()
            primary = SmartRoutingProvider(primary, mlx)
            logger.info("MLX smart routing enabled (standard/light -> %s)", settings.MLX_BASE_URL)
        except Exception as exc:
            logger.warning("Failed to initialize MLX provider, skipping smart routing: %s", exc)

    _cached_provider = primary
    return _cached_provider
