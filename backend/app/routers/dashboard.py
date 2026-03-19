import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.application import Application
from app.models.job import JobListing
from app.models.profile import Profile, ProfileSkill
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.dashboard import DashboardStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up the DB user id from the OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


@router.get("", response_model=DashboardStats)
async def get_dashboard(
    current_user: UserInfo = Depends(require_permission("dashboard", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics for the current user."""
    user_id = await _get_user_id(db, current_user)

    # Total jobs
    total_jobs_result = await db.execute(
        select(func.count()).select_from(JobListing).where(JobListing.user_id == user_id)
    )
    total_jobs = total_jobs_result.scalar() or 0

    # Active applications (not rejected/withdrawn)
    active_apps_result = await db.execute(
        select(func.count())
        .select_from(Application)
        .where(
            Application.user_id == user_id,
            Application.status.notin_(["rejected", "withdrawn"]),
        )
    )
    active_applications = active_apps_result.scalar() or 0

    # Interviews
    interviews_result = await db.execute(
        select(func.count())
        .select_from(Application)
        .where(Application.user_id == user_id, Application.status == "interviewing")
    )
    interviews = interviews_result.scalar() or 0

    # Offers
    offers_result = await db.execute(
        select(func.count())
        .select_from(Application)
        .where(Application.user_id == user_id, Application.status == "offer")
    )
    offers = offers_result.scalar() or 0

    # Match rate: average match_score of analyzed jobs
    match_rate_result = await db.execute(
        select(func.avg(JobListing.match_score)).where(
            JobListing.user_id == user_id,
            JobListing.match_score.isnot(None),
        )
    )
    avg_match = match_rate_result.scalar()
    match_rate = f"{avg_match:.0f}%" if avg_match is not None else "N/A"

    # Profile completeness
    profile_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile:
        fields_filled = sum([
            bool(profile.headline),
            bool(profile.summary),
            bool(profile.raw_resume_text),
            bool(profile.linkedin_url),
        ])
        has_skills = len(profile.skills) > 0 if profile.skills else False
        has_experience = len(profile.experiences) > 0 if profile.experiences else False
        has_education = len(profile.educations) > 0 if profile.educations else False
        completeness = (fields_filled + int(has_skills) + int(has_experience) + int(has_education)) / 7 * 100
        profile_completeness = f"{completeness:.0f}%"
    else:
        profile_completeness = "0%"

    # Skills count
    if profile:
        skills_count = len(profile.skills) if profile.skills else 0
    else:
        skills_count = 0

    # Recent activity (items created in the last 7 days)
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_jobs_result = await db.execute(
        select(func.count())
        .select_from(JobListing)
        .where(JobListing.user_id == user_id, JobListing.created_at >= seven_days_ago)
    )
    recent_apps_result = await db.execute(
        select(func.count())
        .select_from(Application)
        .where(Application.user_id == user_id, Application.created_at >= seven_days_ago)
    )
    recent_activity = (recent_jobs_result.scalar() or 0) + (recent_apps_result.scalar() or 0)

    return DashboardStats(
        total_jobs=total_jobs,
        active_applications=active_applications,
        interviews=interviews,
        offers=offers,
        match_rate=match_rate,
        profile_completeness=profile_completeness,
        skills_count=skills_count,
        recent_activity=recent_activity,
    )
