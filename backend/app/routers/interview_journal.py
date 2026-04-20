"""Interview Journal endpoints.

Per-application timeline of interview notes, outcomes, feedback, and debriefs.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.application import Application
from app.models.interview_journal import InterviewJournalEntry
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.interview_journal import (
    JournalEntryCreate,
    JournalEntryOut,
    JournalEntryUpdate,
)

router = APIRouter(prefix="/api/interview-journal", tags=["interview-journal"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(
        select(User).where(User.oidc_subject == current_user.sub)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user.id


@router.get(
    "/by-application/{app_id}",
    response_model=list[JournalEntryOut],
    dependencies=[Depends(require_permission("interview_journal", "view"))],
)
async def list_by_application(
    app_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    app_check = await db.execute(
        select(Application).where(
            Application.id == app_id, Application.user_id == user_id
        )
    )
    if not app_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    query = (
        select(InterviewJournalEntry)
        .where(
            InterviewJournalEntry.application_id == app_id,
            InterviewJournalEntry.user_id == user_id,
        )
        .order_by(InterviewJournalEntry.entry_date.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "",
    response_model=JournalEntryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("interview_journal", "create"))],
)
async def create_entry(
    body: JournalEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)

    app_check = await db.execute(
        select(Application).where(
            Application.id == body.application_id, Application.user_id == user_id
        )
    )
    if not app_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )

    data = body.model_dump(exclude_unset=True)
    entry = InterviewJournalEntry(user_id=user_id, **data)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get(
    "/{entry_id}",
    response_model=JournalEntryOut,
    dependencies=[Depends(require_permission("interview_journal", "view"))],
)
async def get_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    entry = await db.get(InterviewJournalEntry, entry_id)
    if not entry or entry.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found"
        )
    return entry


@router.put(
    "/{entry_id}",
    response_model=JournalEntryOut,
    dependencies=[Depends(require_permission("interview_journal", "edit"))],
)
async def update_entry(
    entry_id: uuid.UUID,
    body: JournalEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    entry = await db.get(InterviewJournalEntry, entry_id)
    if not entry or entry.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found"
        )

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(entry, field, value)

    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete(
    "/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("interview_journal", "delete"))],
)
async def delete_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    entry = await db.get(InterviewJournalEntry, entry_id)
    if not entry or entry.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found"
        )
    await db.delete(entry)
    await db.commit()
