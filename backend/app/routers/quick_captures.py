"""Quick Captures router -- capture notes, AI-process them into tasks/events."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.permissions import require_permission
from app.models.quick_capture import QuickCapture
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.quick_capture import (
    QuickCaptureCreate,
    QuickCaptureOut,
    QuickCaptureProcessResult,
)
from app.services import quick_capture_service

router = APIRouter(prefix="/api/quick-captures", tags=["quick_captures"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


@router.post("", response_model=QuickCaptureOut, status_code=status.HTTP_201_CREATED)
async def create_capture(
    data: QuickCaptureCreate,
    current_user: UserInfo = Depends(require_permission("quick_captures", "create")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    capture = await quick_capture_service.create_capture(db, user_id, data.raw_text)
    await db.commit()
    await db.refresh(capture)
    return capture


@router.get("", response_model=list[QuickCaptureOut])
async def list_captures(
    processed: bool | None = Query(None),
    current_user: UserInfo = Depends(require_permission("quick_captures", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    return await quick_capture_service.list_captures(db, user_id, processed=processed)


@router.post("/{capture_id}/process", response_model=QuickCaptureProcessResult)
async def process_capture(
    capture_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("quick_captures", "create")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(QuickCapture).where(
            QuickCapture.id == capture_id,
            QuickCapture.user_id == user_id,
        )
    )
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    if capture.processed:
        raise HTTPException(status_code=400, detail="Capture already processed")

    process_result = await quick_capture_service.process_capture(db, user_id, capture)
    return process_result


@router.delete("/{capture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_capture(
    capture_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("quick_captures", "create")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(QuickCapture).where(
            QuickCapture.id == capture_id,
            QuickCapture.user_id == user_id,
        )
    )
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    await db.delete(capture)
    await db.commit()
