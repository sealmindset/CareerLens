"""Task CRUD service — create, update, list, complete, dismiss."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task


async def create_task(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    title: str,
    description: str | None = None,
    application_id: uuid.UUID | None = None,
    priority: str = "normal",
    due_date=None,
    due_reason: str | None = None,
    source_type: str = "manual",
    source_id: uuid.UUID | None = None,
) -> Task:
    """Create a new task for a user."""
    task = Task(
        user_id=user_id,
        title=title,
        description=description,
        application_id=application_id,
        priority=priority,
        due_date=due_date,
        due_reason=due_reason,
        source_type=source_type,
        source_id=source_id,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


async def update_task(
    db: AsyncSession,
    task: Task,
    **fields,
) -> Task:
    """Update task fields (only those provided)."""
    for key, value in fields.items():
        if hasattr(task, key):
            setattr(task, key, value)
    await db.flush()
    await db.refresh(task)
    return task


async def complete_task(db: AsyncSession, task: Task) -> Task:
    """Mark a task as done."""
    task.status = "done"
    task.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(task)
    return task


async def dismiss_task(db: AsyncSession, task: Task) -> Task:
    """Dismiss a task (soft archive)."""
    task.status = "dismissed"
    await db.flush()
    await db.refresh(task)
    return task


async def list_tasks(
    db: AsyncSession,
    user_id: uuid.UUID,
    status: str | None = None,
    priority: str | None = None,
    application_id: uuid.UUID | None = None,
) -> list[Task]:
    """List tasks for a user with optional filters."""
    query = select(Task).where(Task.user_id == user_id)
    if status:
        query = query.where(Task.status == status)
    if priority:
        query = query.where(Task.priority == priority)
    if application_id:
        query = query.where(Task.application_id == application_id)
    query = query.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_task(
    db: AsyncSession,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Task | None:
    """Get a single task by ID, scoped to user."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_pending_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Count pending + in_progress tasks for a user."""
    result = await db.execute(
        select(func.count(Task.id)).where(
            Task.user_id == user_id,
            Task.status.in_(["pending", "in_progress"]),
        )
    )
    return result.scalar() or 0
