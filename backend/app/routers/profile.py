import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.profile import Profile, ProfileSkill, ProfileExperience, ProfileEducation
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.profile import (
    ProfileOut, ProfileUpdate,
    SkillCreate, SkillOut,
    ExperienceCreate, ExperienceOut,
    EducationCreate, EducationOut,
)

router = APIRouter(prefix="/api/profile", tags=["profile"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up the DB user id from the OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


async def _get_or_create_profile(db: AsyncSession, user_id: uuid.UUID) -> Profile:
    """Get the user's profile, creating an empty one if it doesn't exist."""
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.get("", response_model=ProfileOut)
async def get_profile(
    current_user: UserInfo = Depends(require_permission("profile", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's profile (creates empty one if not exists)."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)
    return profile


@router.put("", response_model=ProfileOut)
async def update_profile(
    data: ProfileUpdate,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/skills", response_model=SkillOut, status_code=status.HTTP_201_CREATED)
async def add_skill(
    data: SkillCreate,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Add a skill to the user's profile."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    skill = ProfileSkill(profile_id=profile.id, **data.model_dump())
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.delete("/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_skill(
    skill_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Remove a skill from the user's profile."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    result = await db.execute(
        select(ProfileSkill).where(
            ProfileSkill.id == skill_id,
            ProfileSkill.profile_id == profile.id,
        )
    )
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")

    await db.delete(skill)
    await db.commit()


@router.post("/experience", response_model=ExperienceOut, status_code=status.HTTP_201_CREATED)
async def add_experience(
    data: ExperienceCreate,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Add an experience entry to the user's profile."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    experience = ProfileExperience(profile_id=profile.id, **data.model_dump())
    db.add(experience)
    await db.commit()
    await db.refresh(experience)
    return experience


@router.put("/experience/{exp_id}", response_model=ExperienceOut)
async def update_experience(
    exp_id: uuid.UUID,
    data: ExperienceCreate,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Update an experience entry."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    result = await db.execute(
        select(ProfileExperience).where(
            ProfileExperience.id == exp_id,
            ProfileExperience.profile_id == profile.id,
        )
    )
    experience = result.scalar_one_or_none()
    if not experience:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experience not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(experience, field, value)

    await db.commit()
    await db.refresh(experience)
    return experience


@router.delete("/experience/{exp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_experience(
    exp_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Remove an experience entry from the user's profile."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    result = await db.execute(
        select(ProfileExperience).where(
            ProfileExperience.id == exp_id,
            ProfileExperience.profile_id == profile.id,
        )
    )
    experience = result.scalar_one_or_none()
    if not experience:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experience not found")

    await db.delete(experience)
    await db.commit()


@router.post("/education", response_model=EducationOut, status_code=status.HTTP_201_CREATED)
async def add_education(
    data: EducationCreate,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Add an education entry to the user's profile."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    education = ProfileEducation(profile_id=profile.id, **data.model_dump())
    db.add(education)
    await db.commit()
    await db.refresh(education)
    return education


@router.delete("/education/{edu_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_education(
    edu_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Remove an education entry from the user's profile."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    result = await db.execute(
        select(ProfileEducation).where(
            ProfileEducation.id == edu_id,
            ProfileEducation.profile_id == profile.id,
        )
    )
    education = result.scalar_one_or_none()
    if not education:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Education not found")

    await db.delete(education)
    await db.commit()


@router.post("/upload-resume", response_model=ProfileOut)
async def upload_resume(
    data: dict,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Placeholder for resume parsing. Accepts {"text": "..."} and stores raw text."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    raw_text = data.get("text", "")
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request body must include 'text' field with resume content",
        )

    profile.raw_resume_text = raw_text
    await db.commit()
    await db.refresh(profile)
    return profile
