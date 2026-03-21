"""Database-backed settings service with .env fallback and in-memory cache."""

import asyncio
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as env_settings
from app.models.app_setting import AppSetting

# In-memory cache: key -> (value, value_type)
_cache: dict[str, tuple[str | None, str]] = {}
_cache_loaded_at: float = 0
CACHE_TTL = 60  # seconds


async def load_cache(db: AsyncSession) -> None:
    """Load all settings from DB into the cache."""
    global _cache, _cache_loaded_at
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()
    _cache = {row.key: (row.value, row.value_type) for row in rows}
    _cache_loaded_at = time.time()


def invalidate_cache() -> None:
    """Force cache to reload on next access."""
    global _cache_loaded_at
    _cache_loaded_at = 0


def _cast_value(value: str | None, value_type: str) -> Any:
    """Cast a string value to the appropriate Python type."""
    if value is None or value == "":
        return "" if value_type == "string" else (0 if value_type == "int" else False)
    if value_type == "int":
        try:
            return int(value)
        except ValueError:
            return 0
    if value_type == "bool":
        return value.lower() in ("true", "1", "yes")
    return value


async def get_setting(key: str, db: AsyncSession | None = None) -> Any:
    """Get a setting value. Priority: DB cache -> .env -> code default.

    For hot-reloadable settings, this should be called per-request.
    For startup settings, the .env value is used at import time and
    this function is used for the UI display.
    """
    global _cache_loaded_at

    # Try cache first (if loaded and not expired)
    if _cache and (time.time() - _cache_loaded_at) < CACHE_TTL:
        if key in _cache:
            val, vtype = _cache[key]
            if val is not None and val != "":
                return _cast_value(val, vtype)

    # Try loading cache if we have a DB session and cache is stale
    if db is not None and (time.time() - _cache_loaded_at) >= CACHE_TTL:
        await load_cache(db)
        if key in _cache:
            val, vtype = _cache[key]
            if val is not None and val != "":
                return _cast_value(val, vtype)

    # Fall back to .env (pydantic Settings)
    env_val = getattr(env_settings, key, None)
    return env_val


async def get_setting_str(key: str, db: AsyncSession | None = None) -> str:
    """Get a setting as a string."""
    val = await get_setting(key, db)
    return str(val) if val is not None else ""
