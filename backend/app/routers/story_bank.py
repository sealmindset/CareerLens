import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.profile import Profile
from app.models.resume_variant import ResumeVariant, ResumeVariantVersion
from app.models.story_bank import StoryBankStory, StoryBankStoryVersion
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.story_bank import (
    PropagateApplyRequest,
    PropagateApplyResponse,
    PropagatePreviewResponse,
    PropagateTarget,
    StoryAIRequest,
    StoryAIResponse,
    StoryBankSummary,
    StoryBulkCreate,
    StoryCreate,
    StoryDetailOut,
    StoryOut,
    StoryUpdate,
)
from app.services.text_matching import word_overlap_ratio

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


# ---------------------------------------------------------------------------
# AI-assisted story refinement
# ---------------------------------------------------------------------------

@router.post(
    "/{story_id}/ai-assist",
    response_model=StoryAIResponse,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def story_ai_assist(
    story_id: uuid.UUID,
    data: StoryAIRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """AI-powered story refinement: guided interview, free-form chat, or revision."""
    from app.ai.agent_service import generate_story_assist

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

    if data.action not in ("interview", "chat", "revise"):
        raise HTTPException(status_code=400, detail="Invalid action. Use: interview, chat, revise")

    # Build story context
    story_parts = [
        f"**Story Title:** {story.story_title}",
        f"**Source Bullet:** {story.source_bullet}",
    ]
    if story.source_title or story.source_company:
        story_parts.append(f"**Role:** {story.source_title or ''} at {story.source_company or ''}")
    story_parts.append(f"\n**THE PROBLEM (The Hook)**\n{story.problem}")
    story_parts.append(f"\n**HOW I SOLVED IT (The Differentiator)**\n{story.solved}")
    story_parts.append(f"\n**WHAT I DEPLOYED (The Proof)**\n{story.deployed}")
    if story.takeaway:
        story_parts.append(f"\n**Key Takeaway:** {story.takeaway}")
    story_context = "## Interview Story Being Refined\n" + "\n".join(story_parts)

    conv_history = [(msg.role, msg.content) for msg in data.history[-10:]]

    suggestion = await generate_story_assist(
        db=db,
        action=data.action,
        story_context=story_context,
        custom_message=data.message,
        conversation_history=conv_history,
    )

    return StoryAIResponse(suggestion=suggestion)


# ---------------------------------------------------------------------------
# Propagation: feedback loop to Resume Variant + Profile
# ---------------------------------------------------------------------------

PROPAGATE_MATCH_THRESHOLD = 0.45  # looser than story reuse — we want partial matches


def _find_matching_experience(
    variant: ResumeVariant,
    source_company: str | None,
    source_title: str | None,
) -> dict | None:
    """Find a matching experience in the variant's JSONB by company+title."""
    if not variant.experiences or not source_company:
        return None
    for exp in variant.experiences:
        exp_company = (exp.get("company") or "").lower()
        exp_title = (exp.get("title") or "").lower()
        target_company = (source_company or "").lower()
        target_title = (source_title or "").lower()
        if target_company and target_company in exp_company or exp_company in target_company:
            if not target_title or target_title in exp_title or exp_title in target_title:
                return exp
    return None


def _find_matching_bullet(
    experience: dict, source_bullet: str
) -> str | None:
    """Find the best matching accomplishment bullet in an experience."""
    accomplishments = experience.get("accomplishments") or []
    best_bullet = None
    best_score = 0.0
    for acc in accomplishments:
        score = word_overlap_ratio(acc, source_bullet)
        if score > best_score:
            best_score = score
            best_bullet = acc
    if best_score >= PROPAGATE_MATCH_THRESHOLD and best_bullet:
        return best_bullet
    # Fallback: try the description field
    desc = experience.get("description") or ""
    if desc and word_overlap_ratio(desc, source_bullet) >= PROPAGATE_MATCH_THRESHOLD:
        return desc
    return None


@router.post(
    "/{story_id}/propagate/preview",
    response_model=PropagatePreviewResponse,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def propagate_preview(
    story_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Preview what can be propagated from a revised story to variant/profile."""
    from app.ai.agent_service import generate_propagation_suggestions

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

    targets: list[PropagateTarget] = []
    original_bullet = story.source_bullet
    original_description: str | None = None

    # --- Variant target ---
    if story.source_variant_id:
        variant = await db.get(ResumeVariant, story.source_variant_id)
        if variant:
            matched_exp = _find_matching_experience(
                variant, story.source_company, story.source_title
            )
            if matched_exp:
                matched_bullet = _find_matching_bullet(matched_exp, story.source_bullet)
                if matched_bullet:
                    original_bullet = matched_bullet
                    original_description = matched_exp.get("description")

                    suggestions = await generate_propagation_suggestions(
                        db=db,
                        story_problem=story.problem,
                        story_solved=story.solved,
                        story_deployed=story.deployed,
                        story_takeaway=story.takeaway,
                        story_proof_metric=story.proof_metric,
                        original_bullet=matched_bullet,
                        original_description=original_description,
                    )

                    title = matched_exp.get("title", "")
                    company = matched_exp.get("company", "")
                    targets.append(PropagateTarget(
                        target_type="variant",
                        original_text=matched_bullet,
                        suggested_text=suggestions["bullet"],
                        entity_id=str(story.source_variant_id),
                        entity_label=f"{title} at {company}",
                    ))

    # --- Profile target ---
    prof_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = prof_result.scalar_one_or_none()
    if profile and story.source_company:
        for exp in profile.experiences:
            exp_company = (exp.company or "").lower()
            exp_title = (exp.title or "").lower()
            target_company = (story.source_company or "").lower()
            target_title = (story.source_title or "").lower()
            if target_company and (target_company in exp_company or exp_company in target_company):
                if not target_title or target_title in exp_title or exp_title in target_title:
                    if exp.description:
                        suggestions = await generate_propagation_suggestions(
                            db=db,
                            story_problem=story.problem,
                            story_solved=story.solved,
                            story_deployed=story.deployed,
                            story_takeaway=story.takeaway,
                            story_proof_metric=story.proof_metric,
                            original_bullet=story.source_bullet,
                            original_description=exp.description,
                        )
                        targets.append(PropagateTarget(
                            target_type="profile",
                            original_text=exp.description,
                            suggested_text=suggestions["description"],
                            entity_id=str(exp.id),
                            entity_label=f"{exp.title} at {exp.company}",
                        ))
                    break

    return PropagatePreviewResponse(targets=targets, story_id=str(story_id))


@router.post(
    "/{story_id}/propagate/apply",
    response_model=PropagateApplyResponse,
    dependencies=[Depends(require_permission("stories", "edit"))],
)
async def propagate_apply(
    story_id: uuid.UUID,
    body: PropagateApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    """Apply propagated changes from a revised story to variant and/or profile."""
    from app.models.profile import ProfileExperience

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

    variant_updated = False
    profile_updated = False
    variant_summary: str | None = None
    profile_summary: str | None = None

    for item in body.updates:
        if item.target_type == "variant" and story.source_variant_id:
            variant = await db.get(ResumeVariant, story.source_variant_id)
            if variant and variant.experiences:
                matched_exp = _find_matching_experience(
                    variant, story.source_company, story.source_title
                )
                if matched_exp:
                    matched_bullet = _find_matching_bullet(
                        matched_exp, story.source_bullet
                    )
                    if matched_bullet:
                        # Snapshot current version
                        snapshot = ResumeVariantVersion(
                            variant_id=variant.id,
                            version_number=variant.current_version,
                            headline=variant.headline,
                            summary=variant.summary,
                            raw_resume_text=variant.raw_resume_text,
                            skills=variant.skills,
                            experiences=variant.experiences,
                            educations=variant.educations,
                            certifications=variant.certifications,
                            additional_sections=variant.additional_sections,
                            change_summary=f"Story Bank propagation: updated bullet for {story.story_title}",
                        )
                        db.add(snapshot)

                        # Replace bullet in experiences JSONB
                        updated_exps = []
                        for exp in variant.experiences:
                            exp_copy = dict(exp)
                            if exp_copy is matched_exp or (
                                exp_copy.get("company") == matched_exp.get("company")
                                and exp_copy.get("title") == matched_exp.get("title")
                            ):
                                accs = list(exp_copy.get("accomplishments") or [])
                                for j, acc in enumerate(accs):
                                    if acc == matched_bullet:
                                        accs[j] = item.new_text
                                        break
                                exp_copy["accomplishments"] = accs
                            updated_exps.append(exp_copy)

                        variant.experiences = updated_exps
                        variant.current_version += 1
                        variant_updated = True
                        variant_summary = f"Updated bullet in {matched_exp.get('title', '')} at {matched_exp.get('company', '')}"

        elif item.target_type == "profile":
            exp_result = await db.execute(
                select(ProfileExperience).where(
                    ProfileExperience.id == uuid.UUID(item.entity_id),
                    ProfileExperience.profile_id.in_(
                        select(Profile.id).where(Profile.user_id == user_id)
                    ),
                )
            )
            prof_exp = exp_result.scalar_one_or_none()
            if prof_exp:
                prof_exp.description = item.new_text
                profile_updated = True
                profile_summary = f"Updated description for {prof_exp.title} at {prof_exp.company}"

    await db.flush()
    await db.commit()

    return PropagateApplyResponse(
        variant_updated=variant_updated,
        profile_updated=profile_updated,
        variant_change_summary=variant_summary,
        profile_change_summary=profile_summary,
    )
