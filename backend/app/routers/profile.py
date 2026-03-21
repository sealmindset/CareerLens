import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.profile import Profile, ProfileSkill, ProfileExperience, ProfileEducation
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.profile import (
    ProfileOut, ProfileUpdate, ResumeUploadResult,
    SkillCreate, SkillOut,
    ExperienceCreate, ExperienceOut,
    EducationCreate, EducationOut,
    ExperienceAIRequest, ExperienceAIResponse,
)
from app.services.linkedin_parser import parse_linkedin_export
from app.services.rag_service import index_profile
from app.services.resume_parser import parse_resume

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

    # Re-index profile for RAG
    try:
        await index_profile(db, profile)
        await db.commit()
    except Exception:
        pass  # Non-critical -- RAG indexing failure shouldn't block profile updates

    return profile


@router.post("/reindex", status_code=status.HTTP_200_OK)
async def reindex_profile(
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Re-index profile content for RAG retrieval."""
    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)
    count = await index_profile(db, profile)
    await db.commit()
    return {"chunks_indexed": count}


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


@router.post("/experiences", response_model=ExperienceOut, status_code=status.HTTP_201_CREATED)
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


@router.put("/experiences/{exp_id}", response_model=ExperienceOut)
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


@router.delete("/experiences/{exp_id}", status_code=status.HTTP_204_NO_CONTENT)
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


@router.post("/experiences/{exp_id}/ai-assist", response_model=ExperienceAIResponse)
async def experience_ai_assist(
    exp_id: uuid.UUID,
    data: ExperienceAIRequest,
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """AI-powered assistance for an experience entry (enhance, interview, improve, or chat)."""
    from app.ai.agent_service import generate_experience_assist

    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    # Load the specific experience
    result = await db.execute(
        select(ProfileExperience).where(
            ProfileExperience.id == exp_id,
            ProfileExperience.profile_id == profile.id,
        )
    )
    experience = result.scalar_one_or_none()
    if not experience:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experience not found")

    if data.action not in ("enhance", "interview", "improve", "chat"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid action")

    # Build experience context
    exp_parts = [
        f"**Role:** {experience.title} at {experience.company}",
        f"**Period:** {experience.start_date or 'N/A'} - {'Present' if experience.is_current else experience.end_date or 'N/A'}",
    ]
    if experience.description:
        exp_parts.append(f"**Current Description:**\n{experience.description}")
    else:
        exp_parts.append("**Current Description:** (empty -- no description yet)")
    experience_context = "## Experience Entry\n" + "\n".join(exp_parts)

    # Build profile context (skills + other experiences for broader context)
    profile_parts = []
    if profile.headline:
        profile_parts.append(f"**Headline:** {profile.headline}")
    if profile.summary:
        profile_parts.append(f"**Summary:** {profile.summary}")
    if profile.skills:
        skill_names = [s.skill_name for s in profile.skills[:20]]
        profile_parts.append(f"**Skills:** {', '.join(skill_names)}")
    profile_context = "## User Profile\n" + "\n".join(profile_parts) if profile_parts else ""

    # Build conversation history for context
    conv_history = [(msg.role, msg.content) for msg in data.history[-10:]]

    suggestion = await generate_experience_assist(
        db=db,
        action=data.action,
        experience_context=experience_context,
        profile_context=profile_context,
        custom_message=data.message,
        conversation_history=conv_history,
    )

    return ExperienceAIResponse(suggestion=suggestion)


@router.post("/educations", response_model=EducationOut, status_code=status.HTTP_201_CREATED)
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


@router.delete("/educations/{edu_id}", status_code=status.HTTP_204_NO_CONTENT)
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


@router.post("/upload-resume", response_model=ResumeUploadResult)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Upload a resume PDF/Word/text file. AI parses it into profile fields and stores raw text."""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    # Validate file size (10 MB max)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 10 MB)")

    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    # Parse the resume
    result = await parse_resume(contents, file.filename)

    if "error" in result and "raw_text" not in result:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result["error"])

    # Always store the raw text
    raw_text = result.get("raw_text", "")
    if raw_text:
        profile.raw_resume_text = raw_text

    # Track what was added
    skills_added = 0
    experiences_added = 0
    educations_added = 0

    # Extract and populate profile fields
    if result.get("headline"):
        profile.headline = result["headline"]
    if result.get("summary"):
        profile.summary = result["summary"]

    # Add skills (skip duplicates)
    existing_skill_names = {s.skill_name.lower() for s in profile.skills}
    for skill_data in result.get("skills", []):
        name = skill_data.get("skill_name", "").strip()
        if not name or name.lower() in existing_skill_names:
            continue
        proficiency = skill_data.get("proficiency_level", "intermediate")
        if proficiency not in ("beginner", "intermediate", "advanced", "expert"):
            proficiency = "intermediate"
        skill = ProfileSkill(
            profile_id=profile.id,
            skill_name=name,
            proficiency_level=proficiency,
            years_experience=skill_data.get("years_experience"),
            source="resume",
        )
        db.add(skill)
        existing_skill_names.add(name.lower())
        skills_added += 1

    # Add experiences
    for exp_data in result.get("experiences", []):
        company = exp_data.get("company", "").strip()
        title = exp_data.get("title", "").strip()
        if not company or not title:
            continue
        start_str = exp_data.get("start_date")
        end_str = exp_data.get("end_date")
        exp = ProfileExperience(
            profile_id=profile.id,
            company=company,
            title=title,
            description=exp_data.get("description"),
            start_date=_parse_date(start_str),
            end_date=_parse_date(end_str),
            is_current=bool(exp_data.get("is_current", False)),
        )
        db.add(exp)
        experiences_added += 1

    # Add educations
    for edu_data in result.get("educations", []):
        institution = edu_data.get("institution", "").strip()
        if not institution:
            continue
        edu = ProfileEducation(
            profile_id=profile.id,
            institution=institution,
            degree=edu_data.get("degree"),
            field_of_study=edu_data.get("field_of_study"),
            graduation_date=_parse_date(edu_data.get("graduation_date")),
        )
        db.add(edu)
        educations_added += 1

    await db.commit()
    await db.refresh(profile)

    # Re-index for RAG after resume upload
    try:
        await index_profile(db, profile)
        await db.commit()
    except Exception:
        pass

    return ResumeUploadResult(
        profile=ProfileOut.model_validate(profile),
        skills_added=skills_added,
        experiences_added=experiences_added,
        educations_added=educations_added,
        raw_text_length=len(raw_text),
        error=result.get("error"),
    )


@router.post("/import-linkedin", response_model=ResumeUploadResult)
async def import_linkedin(
    file: UploadFile = File(...),
    current_user: UserInfo = Depends(require_permission("profile", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Import profile data from a LinkedIn data export ZIP file.

    Users get this file from LinkedIn Settings → Data Privacy → Get a copy of your data.
    The ZIP contains CSV files (Profile.csv, Positions.csv, Education.csv, Skills.csv).
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a ZIP file. LinkedIn's data export is a .zip archive.",
        )

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 50 MB)")

    user_id = await _get_user_id(db, current_user)
    profile = await _get_or_create_profile(db, user_id)

    result = parse_linkedin_export(contents)

    if "error" in result and result["error"] and "raw_text" not in result:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result["error"])

    skills_added = 0
    experiences_added = 0
    educations_added = 0

    # Update profile fields (only if currently empty)
    if result.get("headline") and not profile.headline:
        profile.headline = result["headline"]
    if result.get("summary") and not profile.summary:
        profile.summary = result["summary"]

    # Add skills (skip duplicates)
    existing_skill_names = {s.skill_name.lower() for s in profile.skills}
    for skill_data in result.get("skills", []):
        name = skill_data.get("skill_name", "").strip()
        if not name or name.lower() in existing_skill_names:
            continue
        proficiency = skill_data.get("proficiency_level", "intermediate")
        if proficiency not in ("beginner", "intermediate", "advanced", "expert"):
            proficiency = "intermediate"
        skill = ProfileSkill(
            profile_id=profile.id,
            skill_name=name,
            proficiency_level=proficiency,
            years_experience=skill_data.get("years_experience"),
            source="linkedin",
        )
        db.add(skill)
        existing_skill_names.add(name.lower())
        skills_added += 1

    # Add experiences (skip duplicates by company+title)
    existing_exps = {
        (e.company.lower(), e.title.lower()) for e in profile.experiences
    }
    for exp_data in result.get("experiences", []):
        company = exp_data.get("company", "").strip()
        title = exp_data.get("title", "").strip()
        if not company or not title:
            continue
        if (company.lower(), title.lower()) in existing_exps:
            continue
        exp = ProfileExperience(
            profile_id=profile.id,
            company=company,
            title=title,
            description=exp_data.get("description"),
            start_date=_parse_date(exp_data.get("start_date")),
            end_date=_parse_date(exp_data.get("end_date")),
            is_current=bool(exp_data.get("is_current", False)),
        )
        db.add(exp)
        existing_exps.add((company.lower(), title.lower()))
        experiences_added += 1

    # Add educations (skip duplicates by institution+degree)
    existing_edus = {
        (e.institution.lower(), (e.degree or "").lower()) for e in profile.educations
    }
    for edu_data in result.get("educations", []):
        institution = edu_data.get("institution", "").strip()
        if not institution:
            continue
        degree = (edu_data.get("degree") or "").strip()
        if (institution.lower(), degree.lower()) in existing_edus:
            continue
        edu = ProfileEducation(
            profile_id=profile.id,
            institution=institution,
            degree=degree or None,
            field_of_study=edu_data.get("field_of_study"),
            graduation_date=_parse_date(edu_data.get("graduation_date")),
        )
        db.add(edu)
        existing_edus.add((institution.lower(), degree.lower()))
        educations_added += 1

    await db.commit()
    await db.refresh(profile)

    # Re-index for RAG after LinkedIn import
    try:
        await index_profile(db, profile)
        await db.commit()
    except Exception:
        pass

    raw_text = result.get("raw_text", "")
    return ResumeUploadResult(
        profile=ProfileOut.model_validate(profile),
        skills_added=skills_added,
        experiences_added=experiences_added,
        educations_added=educations_added,
        raw_text_length=len(raw_text),
        error=result.get("error"),
    )


def _parse_date(date_str: str | None) -> date | None:
    """Parse a date string in various formats to a date object."""
    if not date_str:
        return None
    try:
        # Try ISO format first (YYYY-MM-DD)
        return date.fromisoformat(date_str[:10])
    except (ValueError, TypeError):
        return None
