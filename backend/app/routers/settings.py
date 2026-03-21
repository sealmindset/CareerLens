import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as env_settings
from app.database import get_db
from app.middleware.permissions import require_permission
from app.models.app_setting import AppSetting, AppSettingAuditLog
from app.schemas.auth import UserInfo
from app.schemas.setting import (
    AppSettingAuditOut,
    AppSettingBulkUpdate,
    AppSettingOut,
    AppSettingUpdate,
)
from app.services.settings_service import invalidate_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/settings", tags=["settings"])


def _mask_value(setting: AppSetting) -> str | None:
    """Return masked value for sensitive settings."""
    if setting.is_sensitive and setting.value:
        return "********"
    return setting.value


def _effective_value(setting: AppSetting) -> str | None:
    """Return the effective value: DB value if set, otherwise .env fallback."""
    if setting.value is not None and setting.value != "":
        return setting.value
    # Fall back to .env
    env_val = getattr(env_settings, setting.key, None)
    if env_val is not None and str(env_val) != "":
        return str(env_val)
    return setting.value


def _to_out(setting: AppSetting, reveal: bool = False) -> AppSettingOut:
    """Convert model to output schema with masking and fallback."""
    effective = _effective_value(setting)
    display_val = effective
    if setting.is_sensitive and not reveal and effective:
        display_val = "********"
    return AppSettingOut(
        id=str(setting.id),
        key=setting.key,
        value=display_val,
        group_name=setting.group_name,
        display_name=setting.display_name,
        description=setting.description,
        value_type=setting.value_type,
        is_sensitive=setting.is_sensitive,
        requires_restart=setting.requires_restart,
        updated_by=setting.updated_by,
        updated_at=setting.updated_at,
    )


# ---------------------------------------------------------------------------
# Admin endpoints (require app_settings.view / app_settings.edit)
# ---------------------------------------------------------------------------


@router.get("", response_model=list[AppSettingOut])
async def list_settings(
    group: str | None = Query(None, description="Filter by group name"),
    current_user: UserInfo = Depends(require_permission("app_settings", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List all application settings (sensitive values masked)."""
    query = select(AppSetting).order_by(AppSetting.group_name, AppSetting.key)
    if group:
        query = query.where(AppSetting.group_name == group)
    result = await db.execute(query)
    settings_list = result.scalars().all()
    return [_to_out(s) for s in settings_list]


@router.get("/audit/log", response_model=list[AppSettingAuditOut])
async def get_audit_log(
    setting_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, le=200),
    current_user: UserInfo = Depends(require_permission("app_settings", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get setting change audit log."""
    query = (
        select(AppSettingAuditLog)
        .join(AppSetting)
        .order_by(AppSettingAuditLog.created_at.desc())
        .limit(limit)
    )
    if setting_id:
        query = query.where(AppSettingAuditLog.setting_id == setting_id)

    result = await db.execute(query)
    logs = result.scalars().all()

    # Get setting keys for display
    setting_ids_set = {log.setting_id for log in logs}
    if setting_ids_set:
        settings_result = await db.execute(
            select(AppSetting).where(AppSetting.id.in_(setting_ids_set))
        )
        key_map = {s.id: s.key for s in settings_result.scalars().all()}
    else:
        key_map = {}

    return [
        AppSettingAuditOut(
            id=str(log.id),
            setting_key=key_map.get(log.setting_id),
            old_value=log.old_value,
            new_value=log.new_value,
            changed_by=log.changed_by,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get("/{setting_id}", response_model=AppSettingOut)
async def get_setting_detail(
    setting_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("app_settings", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get a single setting by ID (sensitive values masked)."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.id == setting_id)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return _to_out(setting)


@router.get("/{setting_id}/reveal", response_model=AppSettingOut)
async def reveal_setting(
    setting_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("app_settings", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Reveal the actual value of a sensitive setting (requires edit permission)."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.id == setting_id)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return _to_out(setting, reveal=True)


@router.put("/{setting_id}", response_model=AppSettingOut)
async def update_setting(
    setting_id: uuid.UUID,
    data: AppSettingUpdate,
    current_user: UserInfo = Depends(require_permission("app_settings", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update a single setting value."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.id == setting_id)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")

    old_value = setting.value

    # Don't update if the submitted value is the mask placeholder
    new_value = data.value
    if setting.is_sensitive and new_value == "********":
        # User didn't change it, keep existing
        return _to_out(setting)

    # Create audit log (mask sensitive values in audit)
    audit_old = "********" if setting.is_sensitive and old_value else old_value
    audit_new = "********" if setting.is_sensitive and new_value else new_value
    audit = AppSettingAuditLog(
        setting_id=setting.id,
        old_value=audit_old,
        new_value=audit_new,
        changed_by=current_user.email,
    )
    db.add(audit)

    setting.value = new_value
    setting.updated_by = current_user.email

    invalidate_cache()
    await db.commit()
    await db.refresh(setting)
    return _to_out(setting)


@router.put("", response_model=list[AppSettingOut])
async def bulk_update_settings(
    data: AppSettingBulkUpdate,
    current_user: UserInfo = Depends(require_permission("app_settings", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Bulk update multiple settings at once."""
    result = await db.execute(select(AppSetting))
    all_settings = {s.key: s for s in result.scalars().all()}

    updated = []
    for key, new_value in data.settings.items():
        setting = all_settings.get(key)
        if not setting:
            continue

        # Skip if masked value submitted (no change)
        if setting.is_sensitive and new_value == "********":
            updated.append(setting)
            continue

        old_value = setting.value
        if old_value == new_value:
            updated.append(setting)
            continue

        # Audit
        audit_old = "********" if setting.is_sensitive and old_value else old_value
        audit_new = "********" if setting.is_sensitive and new_value else new_value
        audit = AppSettingAuditLog(
            setting_id=setting.id,
            old_value=audit_old,
            new_value=audit_new,
            changed_by=current_user.email,
        )
        db.add(audit)

        setting.value = new_value
        setting.updated_by = current_user.email
        updated.append(setting)

    invalidate_cache()
    await db.commit()

    # Refresh all updated settings
    for s in updated:
        await db.refresh(s)

    return [_to_out(s) for s in updated]


# ---------------------------------------------------------------------------
# Test connection
# ---------------------------------------------------------------------------


class TestConnectionResult(BaseModel):
    success: bool
    provider: str
    model: str
    response: str | None = None
    error: str | None = None
    latency_ms: int | None = None


def _get_fresh_az_token() -> str | None:
    """Get a fresh Azure AD token by reading the MSAL token cache from mounted ~/.azure."""
    import os

    try:
        import msal
    except ImportError:
        logger.warning("msal package not available")
        return None

    cache_path = os.path.join(
        os.environ.get("AZURE_CONFIG_DIR", os.path.expanduser("~/.azure")),
        "msal_token_cache.json",
    )
    if not os.path.exists(cache_path):
        logger.warning("MSAL token cache not found at %s", cache_path)
        return None

    try:
        cache = msal.SerializableTokenCache()
        with open(cache_path) as f:
            cache.deserialize(f.read())

        # az CLI's well-known client ID
        app = msal.PublicClientApplication(
            "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
            authority="https://login.microsoftonline.com/organizations",
            token_cache=cache,
        )

        accounts = app.get_accounts()
        if not accounts:
            logger.warning("No accounts found in MSAL token cache")
            return None

        result = app.acquire_token_silent(
            ["https://cognitiveservices.azure.com/.default"],
            account=accounts[0],
        )
        if result and "access_token" in result:
            return result["access_token"]

        logger.warning("MSAL silent token acquisition failed: %s", result.get("error_description", "unknown"))
    except Exception as e:
        logger.warning("MSAL token cache read error: %s", e)
    return None


@router.post("/test-connection", response_model=TestConnectionResult)
async def test_ai_connection(
    current_user: UserInfo = Depends(require_permission("app_settings", "edit")),
):
    """Send a minimal prompt to the active AI provider to verify connectivity."""
    from app.ai.provider import get_ai_provider, get_model_for_tier

    provider_name = env_settings.AI_PROVIDER
    model = get_model_for_tier("light")

    start = time.monotonic()
    try:
        # For Azure AI Foundry, always grab a fresh az token (endpoint requires Bearer auth)
        if provider_name == "anthropic_foundry":
            token = _get_fresh_az_token()
            if not token:
                return TestConnectionResult(
                    success=False,
                    provider=provider_name,
                    model=model,
                    error="Could not get Azure token. Run 'az login' on your machine first.",
                    latency_ms=int((time.monotonic() - start) * 1000),
                )
            import httpx

            endpoint = env_settings.AZURE_AI_FOUNDRY_ENDPOINT.rstrip("/")
            async with httpx.AsyncClient(timeout=60) as http:
                resp = await http.post(
                    f"{endpoint}/v1/messages",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "anthropic-version": "2023-06-01",
                    },
                    json={
                        "model": model,
                        "max_tokens": 10,
                        "temperature": 0,
                        "system": "You are a helpful assistant.",
                        "messages": [{"role": "user", "content": "Respond with exactly: OK"}],
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                result_text = data["content"][0]["text"]
        else:
            ai = get_ai_provider()
            result_text = await ai.complete(
                system_prompt="You are a helpful assistant.",
                user_prompt="Respond with exactly: OK",
                model=model,
                temperature=0,
                max_tokens=10,
            )

        elapsed = int((time.monotonic() - start) * 1000)
        return TestConnectionResult(
            success=True,
            provider=provider_name,
            model=model,
            response=result_text.strip()[:100],
            latency_ms=elapsed,
        )
    except Exception as e:
        elapsed = int((time.monotonic() - start) * 1000)
        logger.warning("AI connection test failed for %s: %s", provider_name, e)
        return TestConnectionResult(
            success=False,
            provider=provider_name,
            model=model,
            error=str(e)[:300],
            latency_ms=elapsed,
        )
