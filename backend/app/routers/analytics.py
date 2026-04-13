"""Analytics endpoint for job search trends."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import case, cast, func, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.permissions import require_permission
from app.models.application import Application
from app.models.job import JobListing
from app.models.user import User
from app.schemas.auth import UserInfo

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class StatusCount(BaseModel):
    status: str
    count: int


class WeeklyCount(BaseModel):
    week: str  # ISO date of week start (Monday)
    applications: int
    jobs: int


class CompanyCount(BaseModel):
    company: str
    count: int


class MatchBucket(BaseModel):
    range: str
    count: int


class AnalyticsTrends(BaseModel):
    status_funnel: list[StatusCount]
    weekly_activity: list[WeeklyCount]
    top_companies: list[CompanyCount]
    match_distribution: list[MatchBucket]
    total_applications: int
    total_jobs: int
    avg_match_score: float | None
    interview_rate: float
    offer_rate: float


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


@router.get("/trends", response_model=AnalyticsTrends)
async def get_trends(
    current_user: UserInfo = Depends(require_permission("dashboard", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics trends for the current user's job search."""
    user_id = await _get_user_id(db, current_user)

    # ── Status funnel ──
    status_result = await db.execute(
        select(Application.status, func.count())
        .where(Application.user_id == user_id)
        .group_by(Application.status)
    )
    status_rows = status_result.all()
    status_order = [
        "draft", "tailoring", "ready_to_review", "submitted",
        "interviewing", "offer", "rejected", "withdrawn",
    ]
    status_map = {s: c for s, c in status_rows}
    status_funnel = [
        StatusCount(status=s, count=status_map.get(s, 0))
        for s in status_order
    ]

    # ── Weekly activity (last 12 weeks) ──
    twelve_weeks_ago = datetime.now(timezone.utc) - timedelta(weeks=12)

    app_weekly = await db.execute(
        select(
            func.date_trunc("week", Application.created_at).label("week"),
            func.count().label("cnt"),
        )
        .where(Application.user_id == user_id, Application.created_at >= twelve_weeks_ago)
        .group_by("week")
        .order_by("week")
    )
    app_by_week = {str(row.week.date()): row.cnt for row in app_weekly.all()}

    job_weekly = await db.execute(
        select(
            func.date_trunc("week", JobListing.created_at).label("week"),
            func.count().label("cnt"),
        )
        .where(JobListing.user_id == user_id, JobListing.created_at >= twelve_weeks_ago)
        .group_by("week")
        .order_by("week")
    )
    job_by_week = {str(row.week.date()): row.cnt for row in job_weekly.all()}

    all_weeks = sorted(set(list(app_by_week.keys()) + list(job_by_week.keys())))
    weekly_activity = [
        WeeklyCount(
            week=w,
            applications=app_by_week.get(w, 0),
            jobs=job_by_week.get(w, 0),
        )
        for w in all_weeks
    ]

    # ── Top companies ──
    company_result = await db.execute(
        select(JobListing.company, func.count().label("cnt"))
        .where(JobListing.user_id == user_id, JobListing.company.isnot(None))
        .group_by(JobListing.company)
        .order_by(func.count().desc())
        .limit(8)
    )
    top_companies = [CompanyCount(company=r.company, count=r.cnt) for r in company_result.all()]

    # ── Match score distribution ──
    buckets = [
        ("0-25", 0, 25),
        ("26-50", 26, 50),
        ("51-75", 51, 75),
        ("76-100", 76, 100),
    ]
    match_distribution = []
    for label, lo, hi in buckets:
        result = await db.execute(
            select(func.count())
            .select_from(JobListing)
            .where(
                JobListing.user_id == user_id,
                JobListing.match_score.isnot(None),
                JobListing.match_score >= lo,
                JobListing.match_score <= hi,
            )
        )
        match_distribution.append(MatchBucket(range=label, count=result.scalar() or 0))

    # ── Aggregate stats ──
    total_apps = sum(s.count for s in status_funnel)
    total_jobs_result = await db.execute(
        select(func.count()).select_from(JobListing).where(JobListing.user_id == user_id)
    )
    total_jobs = total_jobs_result.scalar() or 0

    avg_match_result = await db.execute(
        select(func.avg(JobListing.match_score)).where(
            JobListing.user_id == user_id,
            JobListing.match_score.isnot(None),
        )
    )
    avg_match = avg_match_result.scalar()
    avg_match_score = round(float(avg_match), 1) if avg_match is not None else None

    interview_count = status_map.get("interviewing", 0) + status_map.get("offer", 0)
    interview_rate = round(interview_count / total_apps * 100, 1) if total_apps > 0 else 0.0
    offer_count = status_map.get("offer", 0)
    offer_rate = round(offer_count / total_apps * 100, 1) if total_apps > 0 else 0.0

    return AnalyticsTrends(
        status_funnel=status_funnel,
        weekly_activity=weekly_activity,
        top_companies=top_companies,
        match_distribution=match_distribution,
        total_applications=total_apps,
        total_jobs=total_jobs,
        avg_match_score=avg_match_score,
        interview_rate=interview_rate,
        offer_rate=offer_rate,
    )
