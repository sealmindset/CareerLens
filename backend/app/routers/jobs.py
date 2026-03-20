import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.job import JobListing
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.job import (
    JobListingCreate,
    JobListingOut,
    JobListingUpdate,
    JobScrapeRequest,
    JobScrapeResult,
)
from app.services.job_scraper import scrape_job_url

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up the DB user id from the OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


@router.get("", response_model=list[JobListingOut])
async def list_jobs(
    status_filter: str | None = Query(None, alias="status"),
    current_user: UserInfo = Depends(require_permission("jobs", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List current user's job listings, optionally filtered by status."""
    user_id = await _get_user_id(db, current_user)
    query = select(JobListing).where(JobListing.user_id == user_id)
    if status_filter:
        query = query.where(JobListing.status == status_filter)
    query = query.order_by(JobListing.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=JobListingOut, status_code=status.HTTP_201_CREATED)
async def create_job(
    data: JobListingCreate,
    current_user: UserInfo = Depends(require_permission("jobs", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new job listing (from URL)."""
    user_id = await _get_user_id(db, current_user)

    # Check for duplicate URL for this user
    existing = await db.execute(
        select(JobListing).where(
            JobListing.user_id == user_id,
            JobListing.url == data.url,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job listing with this URL already exists",
        )

    job = JobListing(user_id=user_id, **data.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/scrape", response_model=JobScrapeResult)
async def scrape_job(
    data: JobScrapeRequest,
    current_user: UserInfo = Depends(require_permission("jobs", "create")),
):
    """Scrape a job listing URL and return extracted details (does not save)."""
    result = await scrape_job_url(data.url)
    return JobScrapeResult(**result)


@router.post("/import", response_model=JobListingOut, status_code=status.HTTP_201_CREATED)
async def import_job(
    data: JobScrapeRequest,
    current_user: UserInfo = Depends(require_permission("jobs", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Scrape a job listing URL and create the job in one step."""
    user_id = await _get_user_id(db, current_user)

    # Check for duplicate URL
    existing = await db.execute(
        select(JobListing).where(
            JobListing.user_id == user_id,
            JobListing.url == data.url,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job listing with this URL already exists",
        )

    result = await scrape_job_url(data.url)
    if result.get("error"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result["error"],
        )

    # Extract requirements before creating the job
    requirements_data = result.pop("requirements", []) or []

    job = JobListing(
        user_id=user_id,
        url=data.url,
        title=result.get("title") or "Untitled Position",
        company=result.get("company") or "Unknown Company",
        description=result.get("description"),
        location=result.get("location"),
        salary_range=result.get("salary_range"),
        job_type=result.get("job_type"),
        source=result.get("source", "company_site"),
    )
    db.add(job)
    await db.flush()

    # Add extracted requirements
    for req in requirements_data:
        from app.models.job import JobRequirement

        db.add(JobRequirement(
            job_listing_id=job.id,
            requirement_text=req.get("text", ""),
            requirement_type=req.get("type", "required"),
        ))

    await db.commit()
    await db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobListingOut)
async def get_job(
    job_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("jobs", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get a job listing with its requirements."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(JobListing).where(JobListing.id == job_id, JobListing.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
    return job


@router.put("/{job_id}", response_model=JobListingOut)
async def update_job(
    job_id: uuid.UUID,
    data: JobListingUpdate,
    current_user: UserInfo = Depends(require_permission("jobs", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update a job listing."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(JobListing).where(JobListing.id == job_id, JobListing.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)

    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("jobs", "delete")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a job listing."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(JobListing).where(JobListing.id == job_id, JobListing.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")

    await db.delete(job)
    await db.commit()


@router.post("/{job_id}/analyze", response_model=JobListingOut)
async def analyze_job(
    job_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("jobs", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Trigger AI analysis of a job listing (placeholder -- returns mock analysis)."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(JobListing).where(JobListing.id == job_id, JobListing.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")

    # Placeholder: mock analysis result
    job.status = "analyzed"
    job.match_score = 75.0
    job.match_analysis = (
        "Mock analysis: This is a placeholder. In production, the AI agent will analyze "
        "this job listing against your profile, identify skill matches and gaps, and "
        "provide a detailed compatibility report."
    )

    await db.commit()
    await db.refresh(job)
    return job
