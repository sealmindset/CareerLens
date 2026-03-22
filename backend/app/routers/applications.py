import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.application import Application
from app.models.job import JobListing
from app.models.user import User
from app.schemas.application import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationStatusUpdate,
    ApplicationUpdate,
)
from app.schemas.auth import UserInfo

router = APIRouter(prefix="/api/applications", tags=["applications"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up the DB user id from the OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


def _enrich_application(app: Application) -> dict:
    """Add job_title and job_company from the job_listing relationship."""
    data = {c.key: getattr(app, c.key) for c in app.__table__.columns}
    if app.job_listing:
        data["job_title"] = app.job_listing.title
        data["job_company"] = app.job_listing.company
    else:
        data["job_title"] = None
        data["job_company"] = None
    return data


@router.get("", response_model=list[ApplicationOut])
async def list_applications(
    status_filter: str | None = Query(None, alias="status"),
    current_user: UserInfo = Depends(require_permission("applications", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List current user's applications, optionally filtered by status."""
    user_id = await _get_user_id(db, current_user)
    query = select(Application).where(Application.user_id == user_id)
    if status_filter:
        query = query.where(Application.status == status_filter)
    query = query.order_by(Application.created_at.desc())
    result = await db.execute(query)
    return [_enrich_application(app) for app in result.scalars().all()]


@router.post("", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
async def create_application(
    data: ApplicationCreate,
    current_user: UserInfo = Depends(require_permission("applications", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Create an application from a job listing."""
    user_id = await _get_user_id(db, current_user)

    # Verify the job listing exists and belongs to the user
    job_result = await db.execute(
        select(JobListing).where(
            JobListing.id == data.job_listing_id,
            JobListing.user_id == user_id,
        )
    )
    if not job_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found"
        )

    # Check for duplicate application
    existing = await db.execute(
        select(Application).where(Application.job_listing_id == data.job_listing_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Application for this job listing already exists",
        )

    application = Application(user_id=user_id, **data.model_dump())
    db.add(application)
    await db.commit()
    await db.refresh(application)
    return application


@router.get("/{app_id}", response_model=ApplicationOut)
async def get_application(
    app_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("applications", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get an application by ID."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.user_id == user_id)
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return _enrich_application(application)


@router.put("/{app_id}", response_model=ApplicationOut)
async def update_application(
    app_id: uuid.UUID,
    data: ApplicationUpdate,
    current_user: UserInfo = Depends(require_permission("applications", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update an application (notes, status, follow_up_date, etc.)."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.user_id == user_id)
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(application, field, value)

    await db.commit()
    await db.refresh(application)
    return application


@router.put("/{app_id}/status", response_model=ApplicationOut)
async def update_application_status(
    app_id: uuid.UUID,
    data: ApplicationStatusUpdate,
    current_user: UserInfo = Depends(require_permission("applications", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update just the status of an application."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.user_id == user_id)
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    application.status = data.status
    if data.status == "submitted" and not application.submitted_at:
        application.submitted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(application)
    return application


@router.delete("/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    app_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("applications", "delete")),
    db: AsyncSession = Depends(get_db),
):
    """Delete an application."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(Application).where(Application.id == app_id, Application.user_id == user_id)
    )
    application = result.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    await db.delete(application)
    await db.commit()
