import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.permissions import require_permission
from app.models.managed_prompt import ManagedPrompt, PromptAuditLog, PromptVersion
from app.schemas.auth import UserInfo
from app.schemas.prompt import PromptDetailOut, PromptOut, PromptUpdate
from app.ai.prompt_loader import invalidate_cache
from app.ai.validate_template import test_prompt_draft, validate_prompt_template

router = APIRouter(prefix="/api/admin/prompts", tags=["prompts"])


@router.get("", response_model=list[PromptOut])
async def list_prompts(
    agent_name: str | None = Query(None),
    category: str | None = Query(None),
    current_user: UserInfo = Depends(require_permission("prompts", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List all managed prompts with optional filters."""
    query = select(ManagedPrompt).order_by(ManagedPrompt.agent_name, ManagedPrompt.name)
    if agent_name:
        query = query.where(ManagedPrompt.agent_name == agent_name)
    if category:
        query = query.where(ManagedPrompt.category == category)

    result = await db.execute(query)
    prompts = result.scalars().all()

    # Count versions for each prompt
    out = []
    for p in prompts:
        version_count = len(p.versions) if p.versions else 0
        data = PromptOut.model_validate(p)
        data.version_count = version_count
        out.append(data)
    return out


@router.get("/{prompt_id}", response_model=PromptDetailOut)
async def get_prompt_detail(
    prompt_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("prompts", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get a prompt with its version history (last 20)."""
    result = await db.execute(
        select(ManagedPrompt)
        .options(selectinload(ManagedPrompt.versions))
        .where(ManagedPrompt.id == prompt_id)
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    data = PromptDetailOut.model_validate(prompt)
    data.versions = data.versions[:20]
    data.version_count = len(prompt.versions)
    return data


@router.put("/{prompt_id}")
async def update_prompt(
    prompt_id: uuid.UUID,
    data: PromptUpdate,
    current_user: UserInfo = Depends(require_permission("prompts", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update a managed prompt. Supports save, test, and publish actions."""
    result = await db.execute(
        select(ManagedPrompt)
        .options(selectinload(ManagedPrompt.versions))
        .where(ManagedPrompt.id == prompt_id)
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    action = data.action

    # --- TEST action ---
    if action == "test":
        test_result = test_prompt_draft(prompt.content)
        audit = PromptAuditLog(
            prompt_id=prompt.id,
            action="test",
            risk_flag=not test_result["passed"],
            warnings=json.dumps(test_result["validation"]["warnings"]),
            changed_by=current_user.email,
            content_snapshot=prompt.content[:5000],
        )
        db.add(audit)
        if test_result["passed"]:
            prompt.status = "testing"
        await db.commit()
        return test_result

    # --- PUBLISH action ---
    if action == "publish":
        if prompt.status != "testing":
            raise HTTPException(
                status_code=422,
                detail="Prompt must pass testing before publishing. Run tests first.",
            )
        prompt.status = "published"
        audit = PromptAuditLog(
            prompt_id=prompt.id,
            action="publish",
            risk_flag=False,
            changed_by=current_user.email,
            content_snapshot=prompt.content[:5000],
        )
        db.add(audit)
        invalidate_cache(prompt.slug)
        await db.commit()
        await db.refresh(prompt)
        return PromptOut.model_validate(prompt)

    # --- SAVE action (default) ---
    content_changed = data.content is not None and data.content != prompt.content

    # Validate content if changed
    if content_changed:
        validation = validate_prompt_template(data.content)
        audit = PromptAuditLog(
            prompt_id=prompt.id,
            action="save",
            risk_flag=bool(validation["warnings"]),
            warnings=json.dumps(validation["warnings"]) if validation["warnings"] else None,
            blocked_reasons=json.dumps(validation["blocked_reasons"]) if validation["blocked_reasons"] else None,
            changed_by=current_user.email,
            content_snapshot=data.content[:5000],
        )
        db.add(audit)

        if validation["blocked"]:
            await db.commit()
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Content blocked by safety validation",
                    "blocked_reasons": validation["blocked_reasons"],
                },
            )

        prompt.content = data.content
        prompt.status = "draft"

        # Create new version
        max_version = max((v.version for v in prompt.versions), default=0)
        version = PromptVersion(
            prompt_id=prompt.id,
            version=max_version + 1,
            content=data.content,
            change_summary=data.change_summary,
            changed_by=current_user.email,
        )
        db.add(version)

    # Apply metadata updates
    if data.name is not None:
        prompt.name = data.name
    if data.description is not None:
        prompt.description = data.description
    if data.is_active is not None:
        prompt.is_active = data.is_active
    if data.temperature is not None:
        prompt.temperature = data.temperature
    if data.max_tokens is not None:
        prompt.max_tokens = data.max_tokens
    prompt.updated_by = current_user.email

    invalidate_cache(prompt.slug)
    await db.commit()
    await db.refresh(prompt)

    response = {"prompt": PromptOut.model_validate(prompt)}
    if content_changed:
        validation = validate_prompt_template(prompt.content)
        if validation["warnings"]:
            response["warnings"] = validation["warnings"]
    return response
