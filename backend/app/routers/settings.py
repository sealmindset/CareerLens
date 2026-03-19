from fastapi import APIRouter, Depends

from app.config import settings
from app.middleware.permissions import require_permission
from app.schemas.auth import UserInfo

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings(
    current_user: UserInfo = Depends(require_permission("settings", "view")),
):
    """Get app settings including AI provider configuration."""
    provider_config = {
        "provider": settings.AI_PROVIDER,
        "base_url": settings.AZURE_AI_FOUNDRY_ENDPOINT or None,
        "models": {
            "heavy": settings.AI_MODEL_HEAVY,
            "standard": settings.AI_MODEL_STANDARD,
            "light": settings.AI_MODEL_LIGHT,
        },
    }

    tier_assignments = [
        {
            "tier": "heavy",
            "model": settings.AI_MODEL_HEAVY,
            "description": "Complex reasoning: Tailor, Coach, Strategist agents",
        },
        {
            "tier": "standard",
            "model": settings.AI_MODEL_STANDARD,
            "description": "Analysis & research: Scout, Brand Advisor agents",
        },
        {
            "tier": "light",
            "model": settings.AI_MODEL_LIGHT,
            "description": "Form filling & coordination: Coordinator agent",
        },
    ]

    return {
        "provider": provider_config,
        "tier_assignments": tier_assignments,
    }
