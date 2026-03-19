import logging
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.safety_preamble import SAFETY_PREAMBLE
from app.models.managed_prompt import ManagedPrompt

logger = logging.getLogger(__name__)

# In-memory cache: slug -> (content, expires_at)
_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 60  # seconds


def invalidate_cache(slug: Optional[str] = None) -> None:
    if slug:
        _cache.pop(slug, None)
    else:
        _cache.clear()


async def get_prompt(db: AsyncSession, slug: str, fallback: str) -> str:
    """Load a managed prompt by slug with caching and safety preamble.

    1. Check in-memory cache (60s TTL)
    2. Query DB for active, published prompt
    3. Fall back to hardcoded default
    4. Always prepend immutable safety preamble
    """
    now = time.time()
    cached = _cache.get(slug)
    if cached and cached[1] > now:
        return SAFETY_PREAMBLE + cached[0]

    try:
        result = await db.execute(
            select(ManagedPrompt).where(
                ManagedPrompt.slug == slug,
                ManagedPrompt.is_active == True,
                ManagedPrompt.status == "published",
            )
        )
        prompt = result.scalar_one_or_none()
        if prompt:
            _cache[slug] = (prompt.content, now + _CACHE_TTL)
            return SAFETY_PREAMBLE + prompt.content
    except Exception:
        logger.exception("Failed to load prompt '%s' from database", slug)

    # Fallback to hardcoded default
    _cache[slug] = (fallback, now + _CACHE_TTL)
    return SAFETY_PREAMBLE + fallback


async def get_prompt_config(db: AsyncSession, slug: str) -> tuple[float, int, str]:
    """Return (temperature, max_tokens, model_tier) for a prompt slug."""
    try:
        result = await db.execute(
            select(ManagedPrompt).where(
                ManagedPrompt.slug == slug,
                ManagedPrompt.is_active == True,
            )
        )
        prompt = result.scalar_one_or_none()
        if prompt:
            return prompt.temperature, prompt.max_tokens, prompt.model_tier
    except Exception:
        logger.exception("Failed to load prompt config for '%s'", slug)
    return 0.3, 2048, "standard"
