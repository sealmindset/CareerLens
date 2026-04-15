"""Tasks router -- CRUD + complete/dismiss for user tasks."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.permissions import require_permission
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate
from app.services import task_service
from sqlalchemy import select

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    application_id: uuid.UUID | None = Query(None),
    current_user: UserInfo = Depends(require_permission("tasks", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    return await task_service.list_tasks(
        db, user_id, status=status_filter, priority=priority, application_id=application_id
    )


@router.get("/pending-count")
async def pending_count(
    current_user: UserInfo = Depends(require_permission("tasks", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    count = await task_service.get_pending_count(db, user_id)
    return {"count": count}


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("tasks", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    task = await task_service.get_task(db, task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    current_user: UserInfo = Depends(require_permission("tasks", "create")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    task = await task_service.create_task(
        db,
        user_id=user_id,
        title=data.title,
        description=data.description,
        application_id=data.application_id,
        priority=data.priority,
        due_date=data.due_date,
        due_reason=data.due_reason,
        source_type=data.source_type,
    )
    await db.commit()
    await db.refresh(task)
    return task


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    current_user: UserInfo = Depends(require_permission("tasks", "edit")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    task = await task_service.get_task(db, task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    update_data = data.model_dump(exclude_unset=True)
    task = await task_service.update_task(db, task, **update_data)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}/complete", response_model=TaskOut)
async def complete_task(
    task_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("tasks", "edit")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    task = await task_service.get_task(db, task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task = await task_service.complete_task(db, task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}/dismiss", response_model=TaskOut)
async def dismiss_task(
    task_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("tasks", "edit")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    task = await task_service.get_task(db, task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task = await task_service.dismiss_task(db, task)
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("tasks", "delete")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    task = await task_service.get_task(db, task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
