import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.story_bank import StoryBankStory, StoryBankStoryVersion
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.story_bank import (
    StoryBankSummary,
    StoryBulkCreate,
    StoryCreate,
    StoryDetailOut,
    StoryOut,
    StoryUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stories", tags=["stories"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


# ---------------------------------------------------------------------------
# List stories
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=list[StoryOut],
    dependencies=[Depends(require_permission("stories", "view"))],
)
async def list_stories(
    status_filter: str | None = Query(None, alias="status"),
    company: str | None = None,
    variant_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    query = select(StoryBankStory).where(StoryBankStory.user_id == user_id)

    if status_filter:
        query = query.where(StoryBankStory.status == status_filter)
    if company:
        query = query.where(StoryBankStory.source_company.ilike(f"%{company}%"))
    if variant_id:
        query = query.where(StoryBankStory.source_variant_id == variant_id)

    query = query.order_by(StoryBankStory.updated_at.desc())
    result = await db.execute(query)
    stories = list(result.scalars().all())

    return [
        StoryOut(
            **{c.key: getattr(s, c.key) for c in StoryBankStory.__table__.columns},
            version_count=len(s.versions),
        )
        for s in stories
    ]


# ---------------------------------------------------------------------------
# Summary stats
# ---------------------------------------------------------------------------

@router.get(
    "/summary",
    response_model=StoryBankSummary,
    dependencies=[Depends(require_permission("stories", "view"))],
)
async def story_summary(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)

    total_q = await db.execute(
        select(func.count()).select_from(StoryBankStory).where(
            StoryBankStory.user_id == user_id
        )
    )
    total = total_q.scalar() or 0

    active_q = await db.execute(
        select(func.count()).select_from(StoryBankStory).where(
            StoryBankStory.user_id == user_id,
            StoryBankStory.status == "active",
        )
    )
    active = active_q.scalar() or 0

    companies_q = await db.execute(
        select(func.count(func.distinct(StoryBankStory.source_company))).where(
            StoryBankStory.user_id == user_id,
            StoryBankStory.source_company.isnot(None),
        )
    )
    unique_companies = companies_q.scalar() or 0

    recent_q = await db.execute(
        select(func.max(StoryBankStory.updated_at)).where(
            StoryBankStory.user_id == user_id,
        )
    )
    most_recent = recent_q.scalar()

    return StoryBankSummary(
        total_count=total,
        active_count=active,
        archived_count=total - active,
        unique_companies=unique_companies,
        most_recent_update=most_recent,
    )


# ---------------------------------------------------------------------------
# Get single story with versions
# ---------------------------------------------------------------------------

@router.get(
    "/{story_id}",
    response_model=StoryDetailOut,
    dependencies=[Depends(require_permission("stories", "view"))],
)
async def get_story(
    story_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.id == story_id,
            StoryBankStory.user_id == user_id,
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    return StoryDetailOut(
        **{c.key: getattr(story, c.key) for c in StoryBankStory.__table__.columns},
        version_count=len(story.versions),
        versions=story.versions,
    )


# ---------------------------------------------------------------------------
# Create single story
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=StoryOut,
    status_code=201,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def create_story(
    body: StoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    story = StoryBankStory(
        user_id=user_id,
        **body.model_dump(),
    )
    db.add(story)
    await db.flush()
    await db.refresh(story)
    await db.commit()

    return StoryOut(
        **{c.key: getattr(story, c.key) for c in StoryBankStory.__table__.columns},
        version_count=0,
    )


# ---------------------------------------------------------------------------
# Bulk create (from Talking Points agent)
# ---------------------------------------------------------------------------

@router.post(
    "/bulk",
    response_model=list[StoryOut],
    status_code=201,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def bulk_create_stories(
    body: StoryBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    created = []

    for item in body.stories:
        story = StoryBankStory(
            user_id=user_id,
            **item.model_dump(),
        )
        db.add(story)
        await db.flush()
        await db.refresh(story)
        created.append(story)

    await db.commit()

    return [
        StoryOut(
            **{c.key: getattr(s, c.key) for c in StoryBankStory.__table__.columns},
            version_count=0,
        )
        for s in created
    ]


# ---------------------------------------------------------------------------
# Update story (with version snapshot)
# ---------------------------------------------------------------------------

@router.put(
    "/{story_id}",
    response_model=StoryOut,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def update_story(
    story_id: uuid.UUID,
    body: StoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.id == story_id,
            StoryBankStory.user_id == user_id,
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    # Snapshot current state before updating
    version = StoryBankStoryVersion(
        story_id=story.id,
        version_number=story.current_version,
        problem=story.problem,
        solved=story.solved,
        deployed=story.deployed,
        takeaway=story.takeaway,
        hook_line=story.hook_line,
        trigger_keywords=story.trigger_keywords,
        proof_metric=story.proof_metric,
        change_summary=body.change_summary,
    )
    db.add(version)

    # Apply updates
    update_data = body.model_dump(exclude_unset=True, exclude={"change_summary"})
    for field, value in update_data.items():
        setattr(story, field, value)
    story.current_version += 1

    await db.flush()
    await db.refresh(story)
    await db.commit()

    return StoryOut(
        **{c.key: getattr(story, c.key) for c in StoryBankStory.__table__.columns},
        version_count=len(story.versions),
    )


# ---------------------------------------------------------------------------
# Archive / Restore
# ---------------------------------------------------------------------------

@router.put(
    "/{story_id}/archive",
    response_model=StoryOut,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def archive_story(
    story_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.id == story_id,
            StoryBankStory.user_id == user_id,
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    story.status = "archived"
    await db.flush()
    await db.refresh(story)
    await db.commit()

    return StoryOut(
        **{c.key: getattr(story, c.key) for c in StoryBankStory.__table__.columns},
        version_count=len(story.versions),
    )


@router.put(
    "/{story_id}/restore",
    response_model=StoryOut,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def restore_story(
    story_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.id == story_id,
            StoryBankStory.user_id == user_id,
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    story.status = "active"
    await db.flush()
    await db.refresh(story)
    await db.commit()

    return StoryOut(
        **{c.key: getattr(story, c.key) for c in StoryBankStory.__table__.columns},
        version_count=len(story.versions),
    )


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete(
    "/{story_id}",
    status_code=204,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def delete_story(
    story_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.id == story_id,
            StoryBankStory.user_id == user_id,
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    await db.delete(story)
    await db.commit()


# ---------------------------------------------------------------------------
# Increment usage counter
# ---------------------------------------------------------------------------

@router.post(
    "/{story_id}/use",
    response_model=StoryOut,
    dependencies=[Depends(require_permission("stories", "view"))],
)
async def mark_story_used(
    story_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.id == story_id,
            StoryBankStory.user_id == user_id,
        )
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    story.times_used += 1
    await db.flush()
    await db.refresh(story)
    await db.commit()

    return StoryOut(
        **{c.key: getattr(story, c.key) for c in StoryBankStory.__table__.columns},
        version_count=len(story.versions),
    )
