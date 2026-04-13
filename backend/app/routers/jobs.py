import json
import logging
import uuid
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.job import JobListing
from app.models.profile import Profile
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.job import (
    JobListingCreate,
    JobListingOut,
    JobListingUpdate,
    JobScrapeRequest,
    JobScrapeResult,
)
from app.services.application_detector import detect_application_method
from app.services.job_scraper import scrape_job_url

logger = logging.getLogger(__name__)

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
        application_method=result.get("application_method"),
        application_platform=result.get("application_platform"),
        application_method_details=result.get("application_method_details"),
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


class DiscoverRequest(BaseModel):
    query: str = ""
    location: str = ""


class SearchSuggestion(BaseModel):
    title: str
    keywords: str
    rationale: str


class BoardLink(BaseModel):
    board: str
    url: str


class DiscoverResult(BaseModel):
    suggestions: list[SearchSuggestion]
    search_links: list[BoardLink]


def _build_board_links(keywords: str, location: str) -> list[BoardLink]:
    """Generate direct search URLs for popular job boards."""
    kw = quote_plus(keywords)
    loc = quote_plus(location) if location else ""
    links = []

    if loc:
        links.append(BoardLink(
            board="LinkedIn",
            url=f"https://www.linkedin.com/jobs/search/?keywords={kw}&location={loc}",
        ))
        links.append(BoardLink(
            board="Indeed",
            url=f"https://www.indeed.com/jobs?q={kw}&l={loc}",
        ))
        links.append(BoardLink(
            board="Glassdoor",
            url=f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={kw}&locT=C&locKeyword={loc}",
        ))
    else:
        links.append(BoardLink(
            board="LinkedIn",
            url=f"https://www.linkedin.com/jobs/search/?keywords={kw}",
        ))
        links.append(BoardLink(
            board="Indeed",
            url=f"https://www.indeed.com/jobs?q={kw}",
        ))
        links.append(BoardLink(
            board="Glassdoor",
            url=f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={kw}",
        ))

    links.append(BoardLink(
        board="Google Jobs",
        url=f"https://www.google.com/search?q={kw}+jobs" + (f"+{loc}" if loc else ""),
    ))

    return links


@router.post("/discover", response_model=DiscoverResult)
async def discover_jobs(
    data: DiscoverRequest,
    current_user: UserInfo = Depends(require_permission("jobs", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Generate AI-powered job search suggestions based on profile and query."""
    from app.ai.provider import get_ai_provider, get_model_for_tier

    user_id = await _get_user_id(db, current_user)

    # Load profile for context
    profile_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()

    profile_context = ""
    if profile:
        parts = []
        if profile.headline:
            parts.append(f"Headline: {profile.headline}")
        if profile.summary:
            parts.append(f"Summary: {profile.summary[:300]}")
        if profile.skills:
            skill_names = [s.skill_name for s in profile.skills[:15]]
            parts.append(f"Skills: {', '.join(skill_names)}")
        if profile.experiences:
            recent = profile.experiences[:3]
            exp_lines = [f"- {e.title} at {e.company}" for e in recent]
            parts.append("Recent Experience:\n" + "\n".join(exp_lines))
        profile_context = "\n".join(parts)

    system_prompt = (
        "You are a job search strategist. Given a user's professional profile and optional "
        "search query, suggest 3-5 targeted job search strategies.\n\n"
        "For each suggestion, provide:\n"
        "- title: A short name for the search angle (e.g. 'Senior Backend Engineer')\n"
        "- keywords: The exact keywords to search on job boards\n"
        "- rationale: One sentence explaining why this search targets good opportunities\n\n"
        "Return JSON array only, no markdown:\n"
        '[{"title":"...","keywords":"...","rationale":"..."}]'
    )

    user_prompt_parts = []
    if profile_context:
        user_prompt_parts.append(f"## Profile\n{profile_context}")
    if data.query:
        user_prompt_parts.append(f"## Search Query\n{data.query}")
    if data.location:
        user_prompt_parts.append(f"## Preferred Location\n{data.location}")
    if not data.query and not profile_context:
        user_prompt_parts.append("No profile or query provided. Suggest general tech job searches.")

    user_prompt = "\n\n".join(user_prompt_parts)

    try:
        ai = get_ai_provider()
        model = get_model_for_tier("light")
        raw = await ai.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=0.7,
            max_tokens=1024,
        )

        # Parse JSON from AI response
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        suggestions_data = json.loads(cleaned)
        suggestions = [
            SearchSuggestion(
                title=s.get("title", ""),
                keywords=s.get("keywords", ""),
                rationale=s.get("rationale", ""),
            )
            for s in suggestions_data[:5]
        ]
    except Exception as exc:
        logger.warning("AI discover failed (%s), using fallback", exc)
        # Fallback: generate basic suggestions from profile
        fallback_title = "General Job Search"
        fallback_keywords = data.query or "software engineer"
        if profile and profile.headline:
            fallback_title = profile.headline[:50]
            fallback_keywords = profile.headline
        suggestions = [
            SearchSuggestion(
                title=fallback_title,
                keywords=fallback_keywords,
                rationale="Based on your profile headline",
            )
        ]

    # Generate board links for the first suggestion's keywords
    primary_keywords = suggestions[0].keywords if suggestions else data.query or "software engineer"
    search_links = _build_board_links(primary_keywords, data.location)

    return DiscoverResult(suggestions=suggestions, search_links=search_links)


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


@router.post("/{job_id}/detect-method", response_model=JobListingOut)
async def detect_job_method(
    job_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("jobs", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Run AI-powered application method detection on a job listing."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(JobListing).where(JobListing.id == job_id, JobListing.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")

    detection = await detect_application_method(job.url, use_ai=True)
    job.application_method = detection.method
    job.application_platform = detection.platform
    job.application_method_details = detection.details

    await db.commit()
    await db.refresh(job)
    return job


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
