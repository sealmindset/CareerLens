import json
import re
import uuid
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.resume_variant import ResumeVariant, ResumeVariantVersion
from app.models.user import User
from app.schemas.auth import UserInfo
from app.models.application import Application
from app.schemas.resume_variant import (
    ResumeVariantCreate,
    ResumeVariantUpdate,
    ResumeVariantOut,
    ResumeVariantDetailOut,
    ResumeVariantVersionOut,
    ResumeUploadExtraction,
    ResumeUploadReviewRequest,
    VariantMatchResult,
    VariantDiffResult,
    VariantStatsResponse,
    VariantStatsItem,
    VariantStatusBreakdown,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resume-variants", tags=["resume-variants"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    return slug.strip("-")


def _snapshot_version(variant: ResumeVariant, change_summary: str | None = None) -> ResumeVariantVersion:
    return ResumeVariantVersion(
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
        change_summary=change_summary,
    )


# --- CRUD ---

@router.get("", response_model=list[ResumeVariantOut])
async def list_variants(
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(ResumeVariant)
        .where(ResumeVariant.user_id == user_id)
        .order_by(ResumeVariant.is_default.desc(), ResumeVariant.name)
    )
    return result.scalars().all()


# --- Interview Success Stats ---

@router.get("/stats", response_model=VariantStatsResponse)
async def variant_stats(
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get interview success tracking stats grouped by resume variant."""
    user_id = await _get_user_id(db, current_user)

    # Load user's variants for name lookup
    variants_result = await db.execute(
        select(ResumeVariant).where(ResumeVariant.user_id == user_id)
    )
    variants = {v.id: v for v in variants_result.scalars().all()}

    # Query applications grouped by variant and status
    rows = await db.execute(
        select(
            Application.resume_variant_id,
            Application.resume_type,
            Application.status,
            func.count().label("cnt"),
        )
        .where(Application.user_id == user_id)
        .group_by(Application.resume_variant_id, Application.resume_type, Application.status)
    )

    # Build stats per variant
    variant_data: dict[uuid.UUID, dict] = {}
    unlinked = 0
    tracked_statuses = {"submitted", "interviewing", "offer", "rejected", "withdrawn"}
    interview_plus = {"interviewing", "offer"}

    for row in rows:
        vid = row.resume_variant_id
        rtype = row.resume_type or "original"
        app_status = row.status
        cnt = row.cnt

        if vid is None:
            unlinked += cnt
            continue

        if vid not in variant_data:
            variant_data[vid] = {
                "total": 0,
                "original_count": 0,
                "tailored_count": 0,
                "statuses": {},
            }

        variant_data[vid]["total"] += cnt
        if rtype == "tailored":
            variant_data[vid]["tailored_count"] += cnt
        else:
            variant_data[vid]["original_count"] += cnt

        variant_data[vid]["statuses"][app_status] = (
            variant_data[vid]["statuses"].get(app_status, 0) + cnt
        )

    # Build response items
    items = []
    for vid, data in variant_data.items():
        v = variants.get(vid)
        if not v:
            continue

        statuses = data["statuses"]
        breakdown = VariantStatusBreakdown(
            submitted=statuses.get("submitted", 0),
            interviewing=statuses.get("interviewing", 0),
            offer=statuses.get("offer", 0),
            rejected=statuses.get("rejected", 0),
            withdrawn=statuses.get("withdrawn", 0),
            other=sum(c for s, c in statuses.items() if s not in tracked_statuses),
        )

        submitted_plus = sum(
            c for s, c in statuses.items() if s not in ("draft", "tailoring", "ready_to_review")
        )
        interview_count = sum(statuses.get(s, 0) for s in interview_plus)

        interview_rate = round((interview_count / submitted_plus) * 100, 1) if submitted_plus > 0 else 0.0
        offer_rate = round((statuses.get("offer", 0) / submitted_plus) * 100, 1) if submitted_plus > 0 else 0.0

        items.append(VariantStatsItem(
            variant_id=vid,
            variant_name=v.name,
            is_default=v.is_default,
            total_applications=data["total"],
            original_count=data["original_count"],
            tailored_count=data["tailored_count"],
            status_breakdown=breakdown,
            interview_rate=interview_rate,
            offer_rate=offer_rate,
        ))

    items.sort(key=lambda x: x.interview_rate, reverse=True)

    return VariantStatsResponse(variants=items, unlinked_applications=unlinked)


# --- CRUD (detail) ---

@router.get("/{variant_id}", response_model=ResumeVariantDetailOut)
async def get_variant(
    variant_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    return variant


@router.post("", response_model=ResumeVariantOut, status_code=status.HTTP_201_CREATED)
async def create_variant(
    data: ResumeVariantCreate,
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    slug = _slugify(data.name)

    # Check slug uniqueness for this user
    existing = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.user_id == user_id,
            ResumeVariant.slug == slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A variant with slug '{slug}' already exists",
        )

    # If setting as default, clear other defaults
    if data.is_default:
        await db.execute(
            update(ResumeVariant)
            .where(ResumeVariant.user_id == user_id)
            .values(is_default=False)
        )

    variant = ResumeVariant(
        user_id=user_id,
        name=data.name,
        slug=slug,
        description=data.description,
        target_roles=data.target_roles,
        matching_keywords=data.matching_keywords,
        usage_guidance=data.usage_guidance,
        is_default=data.is_default,
    )
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return variant


@router.put("/{variant_id}", response_model=ResumeVariantOut)
async def update_variant(
    variant_id: uuid.UUID,
    data: ResumeVariantUpdate,
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    update_data = data.model_dump(exclude_unset=True)
    change_summary = update_data.pop("change_summary", None)

    # Check if content fields changed (trigger version snapshot)
    content_fields = {"headline", "summary", "raw_resume_text", "skills", "experiences",
                      "educations", "certifications", "additional_sections"}
    content_changed = any(k in update_data for k in content_fields)

    # If setting as default, clear other defaults
    if update_data.get("is_default"):
        await db.execute(
            update(ResumeVariant)
            .where(ResumeVariant.user_id == user_id, ResumeVariant.id != variant_id)
            .values(is_default=False)
        )

    # Update name -> update slug
    if "name" in update_data:
        update_data["slug"] = _slugify(update_data["name"])

    # Serialize pydantic models in lists
    for field in ("skills", "experiences", "educations", "certifications"):
        if field in update_data and update_data[field] is not None:
            update_data[field] = [
                item.model_dump() if hasattr(item, "model_dump") else item
                for item in update_data[field]
            ]

    for field, value in update_data.items():
        setattr(variant, field, value)

    # Create version snapshot if content changed
    if content_changed:
        variant.current_version += 1
        version = _snapshot_version(variant, change_summary or "Content updated")
        db.add(version)

    await db.commit()
    await db.refresh(variant)
    return variant


@router.delete("/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variant(
    variant_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    await db.delete(variant)
    await db.commit()


# --- Version Control ---

@router.get("/{variant_id}/versions", response_model=list[ResumeVariantVersionOut])
async def list_versions(
    variant_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    # Verify ownership
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    versions = await db.execute(
        select(ResumeVariantVersion)
        .where(ResumeVariantVersion.variant_id == variant_id)
        .order_by(ResumeVariantVersion.version_number.desc())
    )
    return versions.scalars().all()


@router.post("/{variant_id}/restore/{version_number}", response_model=ResumeVariantOut)
async def restore_version(
    variant_id: uuid.UUID,
    version_number: int,
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    ver_result = await db.execute(
        select(ResumeVariantVersion).where(
            ResumeVariantVersion.variant_id == variant_id,
            ResumeVariantVersion.version_number == version_number,
        )
    )
    version = ver_result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    # Restore content from version
    variant.headline = version.headline
    variant.summary = version.summary
    variant.raw_resume_text = version.raw_resume_text
    variant.skills = version.skills
    variant.experiences = version.experiences
    variant.educations = version.educations
    variant.certifications = version.certifications
    variant.additional_sections = version.additional_sections

    # Create new version snapshot for the restore
    variant.current_version += 1
    restore_snapshot = _snapshot_version(
        variant, f"Restored from version {version_number}"
    )
    db.add(restore_snapshot)

    await db.commit()
    await db.refresh(variant)
    return variant


@router.get("/{variant_id}/diff", response_model=VariantDiffResult)
async def diff_versions(
    variant_id: uuid.UUID,
    version_a: int,
    version_b: int,
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_user_id(db, current_user)
    # Verify ownership
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    ver_a_result = await db.execute(
        select(ResumeVariantVersion).where(
            ResumeVariantVersion.variant_id == variant_id,
            ResumeVariantVersion.version_number == version_a,
        )
    )
    ver_a = ver_a_result.scalar_one_or_none()

    ver_b_result = await db.execute(
        select(ResumeVariantVersion).where(
            ResumeVariantVersion.variant_id == variant_id,
            ResumeVariantVersion.version_number == version_b,
        )
    )
    ver_b = ver_b_result.scalar_one_or_none()

    if not ver_a or not ver_b:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both versions not found")

    sections = []
    for field, label in [
        ("headline", "Headline"),
        ("summary", "Summary"),
        ("skills", "Skills"),
        ("experiences", "Experience"),
        ("educations", "Education"),
        ("certifications", "Certifications"),
        ("additional_sections", "Additional"),
    ]:
        val_a = getattr(ver_a, field)
        val_b = getattr(ver_b, field)
        # Serialize for comparison
        str_a = json.dumps(val_a, default=str, indent=2) if isinstance(val_a, (list, dict)) else (val_a or "")
        str_b = json.dumps(val_b, default=str, indent=2) if isinstance(val_b, (list, dict)) else (val_b or "")
        sections.append({
            "section": field,
            "label": label,
            "value_a": str_a,
            "value_b": str_b,
            "changed": str_a != str_b,
        })

    return VariantDiffResult(
        version_a=version_a,
        version_b=version_b,
        sections=sections,
    )


# --- Upload + AI Extraction ---

@router.post("/{variant_id}/upload", response_model=ResumeUploadExtraction)
async def upload_resume_to_variant(
    variant_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Upload a resume file. AI extracts all data adaptively. Returns extraction for review."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 10 MB)")

    from app.services.resume_parser import extract_text
    raw_text = extract_text(contents, file.filename)

    if not raw_text or len(raw_text.strip()) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from the file.",
        )

    # AI extraction with adaptable mapping
    extraction = await _extract_resume_adaptively(raw_text)
    extraction["raw_resume_text"] = raw_text

    return ResumeUploadExtraction(**extraction)


@router.post("/{variant_id}/save-upload", response_model=ResumeVariantOut)
async def save_upload_review(
    variant_id: uuid.UUID,
    data: ResumeUploadReviewRequest,
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
    db: AsyncSession = Depends(get_db),
):
    """Save the reviewed/adjusted extraction data to the variant."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(ResumeVariant).where(
            ResumeVariant.id == variant_id,
            ResumeVariant.user_id == user_id,
        )
    )
    variant = result.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")

    # Update content
    variant.headline = data.headline
    variant.summary = data.summary
    variant.raw_resume_text = data.raw_resume_text
    variant.skills = [s.model_dump() for s in data.skills]
    variant.experiences = [e.model_dump() for e in data.experiences]
    variant.educations = [e.model_dump() for e in data.educations]
    variant.certifications = [c.model_dump() for c in data.certifications]
    variant.additional_sections = data.additional_sections

    # Create version snapshot
    variant.current_version += 1
    version = _snapshot_version(
        variant, data.change_summary or "Uploaded and reviewed resume"
    )
    db.add(version)

    await db.commit()
    await db.refresh(variant)
    return variant


# --- Auto-Matching ---

@router.post("/match/{job_listing_id}", response_model=list[VariantMatchResult])
async def match_variants_to_job(
    job_listing_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Auto-match resume variants to a job listing, ranked by fit."""
    from app.models.job import JobListing

    user_id = await _get_user_id(db, current_user)

    # Load job
    job_result = await db.execute(
        select(JobListing).where(JobListing.id == job_listing_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")

    # Load user's variants
    variants_result = await db.execute(
        select(ResumeVariant).where(ResumeVariant.user_id == user_id)
    )
    variants = variants_result.scalars().all()

    if not variants:
        return []

    # Build JD text for matching
    jd_text = f"{job.title or ''} {job.company or ''} {job.description or ''}".lower()

    results = []
    for v in variants:
        keywords = v.matching_keywords or []
        matched = [kw for kw in keywords if kw.lower() in jd_text]
        # Score: keyword match ratio * 100, with bonus for default
        if keywords:
            score = (len(matched) / len(keywords)) * 80
        else:
            score = 20.0  # base score for variants without keywords
        if v.is_default:
            score = max(score, 40.0)  # default gets minimum 40

        # Check target roles match
        if v.target_roles:
            role_targets = [r.strip().lower() for r in v.target_roles.split(",")]
            title_lower = (job.title or "").lower()
            role_match = any(target in title_lower for target in role_targets)
            if role_match:
                score += 20

        score = min(score, 100.0)

        reasoning_parts = []
        if matched:
            reasoning_parts.append(f"Matched keywords: {', '.join(matched)}")
        if v.target_roles:
            role_targets = [r.strip().lower() for r in v.target_roles.split(",")]
            title_lower = (job.title or "").lower()
            if any(target in title_lower for target in role_targets):
                reasoning_parts.append(f"Job title matches target roles: {v.target_roles}")
        if v.is_default and not reasoning_parts:
            reasoning_parts.append("Default variant (general-purpose)")
        if not reasoning_parts:
            reasoning_parts.append("No specific keyword matches")

        results.append(VariantMatchResult(
            variant_id=v.id,
            variant_name=v.name,
            slug=v.slug,
            is_default=v.is_default,
            match_score=round(score, 1),
            reasoning=". ".join(reasoning_parts),
            matched_keywords=matched,
        ))

    results.sort(key=lambda r: r.match_score, reverse=True)
    return results



# --- AI Extraction Helper ---

async def _extract_resume_adaptively(raw_text: str) -> dict:
    """Use AI to extract resume data with adaptable field mapping.

    Unlike binary mapping, the AI interprets context -- a single bullet point
    can populate multiple fields (e.g., leadership indicators AND scope metrics).
    """
    from app.ai.provider import get_ai_provider, get_model_for_tier

    system_prompt = """You are an expert resume parser. Extract ALL information from this resume
into structured JSON. Your goal is to capture EVERYTHING -- nothing should be left out.

CRITICAL RULES:
1. ADAPTABLE MAPPING: A single statement can map to multiple fields. For example:
   - "Led a team of 12 across 3 business units" → leadership_indicators: ["Led team of 12"],
     scope_metrics: {"team_size": 12, "org_reach": "3 business units"}
   - "Reduced security incidents by 40% through Zero Trust implementation" → description bullet
     AND skill "Zero Trust" AND accomplishment

2. NEVER skip information. If something doesn't fit a standard field, put it in additional_sections.

3. Infer proficiency levels from context (years, seniority, depth of description).

4. Capture accomplishments separately from job descriptions -- they tell a different story.

5. For certifications mentioned anywhere (even inline), extract them to the certifications array.

Return ONLY valid JSON:
{
  "headline": "Professional headline/title",
  "summary": "Professional summary paragraph",
  "skills": [
    {
      "skill_name": "name",
      "proficiency_level": "beginner|intermediate|advanced|expert",
      "years_experience": null or number,
      "context": "where/how this skill was demonstrated"
    }
  ],
  "experiences": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "description": "Role description with key responsibilities",
      "start_date": "YYYY-MM-DD or YYYY-MM-01 or YYYY-01-01",
      "end_date": "YYYY-MM-DD or null if current",
      "is_current": true/false,
      "accomplishments": ["Quantified achievement 1", "Achievement 2"],
      "leadership_indicators": ["Led team of X", "Managed budget of $Y"],
      "scope_metrics": {"team_size": N, "budget": "$X", "org_reach": "description"}
    }
  ],
  "educations": [
    {
      "institution": "School Name",
      "degree": "Degree Type",
      "field_of_study": "Field",
      "graduation_date": "YYYY-MM-DD or null",
      "relevant_coursework": ["Course 1"] or null
    }
  ],
  "certifications": [
    {
      "name": "Cert Name",
      "issuer": "Issuing Body",
      "date_obtained": "YYYY-MM-DD or null",
      "expiry_date": "YYYY-MM-DD or null"
    }
  ],
  "additional_sections": {
    "section_name": "content that didn't fit elsewhere"
  }
}

Extract the ACTUAL content. Do NOT fabricate anything. Return ONLY JSON, no markdown fencing."""

    try:
        provider = get_ai_provider()
        model = get_model_for_tier("standard")
        raw = await provider.complete(
            system_prompt=system_prompt,
            user_prompt=f"Parse this resume completely -- capture everything:\n\n{raw_text[:50000]}",
            model=model,
            temperature=0.1,
            max_tokens=8192,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        logger.error("AI returned invalid JSON for resume extraction")
        return _fallback_extract(raw_text)
    except Exception as e:
        logger.error("AI resume extraction failed: %s", str(e))
        return _fallback_extract(raw_text)


def _fallback_extract(raw_text: str) -> dict:
    """Regex-based fallback when AI is unavailable. Extracts what it can from raw text."""
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]

    # Headline: first non-empty line (often the person's name/title)
    headline = lines[0] if lines else None

    # Summary: look for summary/objective section or take first paragraph
    summary = None
    summary_patterns = re.compile(
        r"^(professional\s+summary|summary|objective|profile|about)\s*:?\s*$", re.I
    )
    for i, line in enumerate(lines):
        if summary_patterns.match(line):
            # Collect lines until next section header
            parts = []
            for j in range(i + 1, min(i + 8, len(lines))):
                if re.match(r"^[A-Z][A-Z\s&/]{3,}$", lines[j]):
                    break
                parts.append(lines[j])
            if parts:
                summary = " ".join(parts)
            break

    # Skills: look for skills section, extract comma/pipe/bullet separated items
    skills = []
    skills_pattern = re.compile(r"^(skills|technical\s+skills|core\s+competencies|competencies|areas\s+of\s+expertise)\s*:?\s*$", re.I)
    for i, line in enumerate(lines):
        if skills_pattern.match(line):
            for j in range(i + 1, min(i + 20, len(lines))):
                if re.match(r"^[A-Z][A-Z\s&/]{3,}$", lines[j]):
                    break
                # Split on commas, pipes, bullets, semicolons
                items = re.split(r"[,;|•·▪►➤–—]", lines[j])
                for item in items:
                    name = item.strip().strip("-").strip("●").strip()
                    if name and len(name) > 1 and len(name) < 60:
                        skills.append({
                            "skill_name": name,
                            "proficiency_level": "intermediate",
                            "years_experience": None,
                            "context": None,
                        })
            break

    # Experiences: look for experience section headers
    experiences = []
    exp_pattern = re.compile(r"^(experience|professional\s+experience|work\s+experience|employment)\s*:?\s*$", re.I)
    # Also match inline job entries like "Company Name — Title" or "Title at Company"
    job_line = re.compile(r"^(.+?)\s*[—–|,]\s*(.+)$")
    date_pattern = re.compile(r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4}|\d{4})\s*[-–—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4}|\d{4}|[Pp]resent|[Cc]urrent)", re.I)
    for i, line in enumerate(lines):
        if exp_pattern.match(line):
            j = i + 1
            while j < len(lines):
                if re.match(r"^(education|certifications?|skills|projects?|awards?|publications?)\s*:?\s*$", lines[j], re.I):
                    break
                m = job_line.match(lines[j])
                dates = date_pattern.search(lines[j] if not m else (lines[j + 1] if j + 1 < len(lines) else ""))
                if m:
                    desc_parts = []
                    k = j + 1
                    if dates and dates.string == (lines[j + 1] if j + 1 < len(lines) else ""):
                        k = j + 2
                    while k < len(lines):
                        if job_line.match(lines[k]) or re.match(r"^[A-Z][A-Z\s&/]{3,}$", lines[k]):
                            break
                        desc_parts.append(lines[k])
                        k += 1
                    experiences.append({
                        "company": m.group(1).strip(),
                        "title": m.group(2).strip(),
                        "description": " ".join(desc_parts) if desc_parts else None,
                        "start_date": None,
                        "end_date": None,
                        "is_current": bool(dates and "present" in (dates.group(2) or "").lower()),
                        "accomplishments": None,
                        "leadership_indicators": None,
                        "scope_metrics": None,
                    })
                    j = k
                else:
                    j += 1
            break

    # Education: look for education section
    educations = []
    edu_pattern = re.compile(r"^(education|academic|degrees?)\s*:?\s*$", re.I)
    degree_pattern = re.compile(r"(Bachelor|Master|Ph\.?D|MBA|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Associate|Doctorate)", re.I)
    for i, line in enumerate(lines):
        if edu_pattern.match(line):
            for j in range(i + 1, min(i + 10, len(lines))):
                if re.match(r"^(experience|certifications?|skills|projects?)\s*:?\s*$", lines[j], re.I):
                    break
                dm = degree_pattern.search(lines[j])
                if dm:
                    educations.append({
                        "institution": lines[j].replace(dm.group(0), "").strip(" ,-–—|"),
                        "degree": dm.group(0),
                        "field_of_study": None,
                        "graduation_date": None,
                        "relevant_coursework": None,
                    })
            break

    # Certifications: look for cert section
    certifications = []
    cert_pattern = re.compile(r"^(certifications?|licenses?\s*(?:&|and)?\s*certifications?)\s*:?\s*$", re.I)
    for i, line in enumerate(lines):
        if cert_pattern.match(line):
            for j in range(i + 1, min(i + 15, len(lines))):
                if re.match(r"^[A-Z][A-Z\s&/]{3,}$", lines[j]):
                    break
                name = lines[j].strip("-•●►▪ ")
                if name and len(name) > 2:
                    certifications.append({
                        "name": name,
                        "issuer": None,
                        "date_obtained": None,
                        "expiry_date": None,
                    })
            break

    return {
        "headline": headline,
        "summary": summary,
        "skills": skills,
        "experiences": experiences,
        "educations": educations,
        "certifications": certifications,
        "additional_sections": None,
    }
