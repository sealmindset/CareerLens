"""Profile Builder -- synthesize a master profile from resume variants.

Reads all of a user's resume variants, unions unique details, and fills
gaps in the profile.  AI is used only for headline/summary synthesis;
skills, experiences, and educations are merged deterministically.
"""

import json
import logging
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile, ProfileEducation, ProfileExperience, ProfileSkill
from app.models.resume_variant import ResumeVariant
from app.schemas.profile import ProfileBuildResult
from app.services.rag_service import index_profile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Date helper (mirrors _parse_date in profile router)
# ---------------------------------------------------------------------------

def _parse_date(date_str: str | None) -> date | None:
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str[:10])
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Cross-variant deduplication helpers
# ---------------------------------------------------------------------------

def _dedup_skills(candidates: list[dict]) -> list[dict]:
    """Deduplicate skills by name (case-insensitive), keeping the richest entry."""
    seen: dict[str, dict] = {}
    for s in candidates:
        name = (s.get("skill_name") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key not in seen:
            seen[key] = s
        else:
            existing = seen[key]
            # Prefer higher proficiency
            levels = {"beginner": 0, "intermediate": 1, "advanced": 2, "expert": 3}
            cur_level = levels.get(existing.get("proficiency_level", ""), 1)
            new_level = levels.get(s.get("proficiency_level", ""), 1)
            if new_level > cur_level:
                seen[key] = s
            elif new_level == cur_level:
                # Prefer more years
                cur_yrs = existing.get("years_experience") or 0
                new_yrs = s.get("years_experience") or 0
                if new_yrs > cur_yrs:
                    seen[key] = s
    return list(seen.values())


def _dedup_experiences(candidates: list[dict]) -> list[dict]:
    """Deduplicate experiences by company+title, keeping the richest entry."""
    seen: dict[str, dict] = {}
    for exp in candidates:
        company = (exp.get("company") or "").strip()
        title = (exp.get("title") or "").strip()
        if not company or not title:
            continue
        key = f"{company.lower()}|{title.lower()}"
        if key not in seen:
            seen[key] = exp
        else:
            # Prefer the entry with a longer description
            existing_desc = len(exp.get("description") or "")
            current_desc = len(seen[key].get("description") or "")
            if existing_desc > current_desc:
                seen[key] = exp
    return list(seen.values())


def _dedup_educations(candidates: list[dict]) -> list[dict]:
    """Deduplicate educations by institution+degree."""
    seen: dict[str, dict] = {}
    for edu in candidates:
        institution = (edu.get("institution") or "").strip()
        if not institution:
            continue
        degree = (edu.get("degree") or "").strip()
        key = f"{institution.lower()}|{degree.lower()}"
        if key not in seen:
            seen[key] = edu
    return list(seen.values())


# ---------------------------------------------------------------------------
# AI headline/summary synthesis
# ---------------------------------------------------------------------------

async def _synthesize_headline_summary(
    headlines: list[str],
    summaries: list[str],
    skill_names: list[str],
) -> dict:
    """Use AI to create a unified headline and summary from variant data."""
    from app.ai.provider import get_ai_provider, get_model_for_tier

    system_prompt = (
        "You are a career branding expert. You are given multiple versions of a "
        "professional headline and summary from the same person's different resume "
        "variants. Each variant targets a different role or emphasis.\n\n"
        "Your job: synthesize ONE master headline and ONE master summary that:\n"
        "- Captures the FULL breadth of this person's expertise (union of all variants)\n"
        "- Uses the strongest, most compelling phrasing from any variant\n"
        "- Reads as a cohesive personal brand, not a list of fragments\n"
        "- Is written in implied first person (standard resume style)\n\n"
        "Headline: max 120 characters, capturing their broadest professional identity.\n"
        "Summary: 3-5 sentences, comprehensive and impactful.\n\n"
        'Return ONLY valid JSON: {"headline": "...", "summary": "..."}'
    )

    headline_block = "\n".join(f'- "{h}"' for h in headlines if h)
    summary_block = "\n".join(f'- "{s}"' for s in summaries if s)
    skills_block = ", ".join(skill_names[:40])

    user_prompt = (
        f"Here are the headlines from {len(headlines)} resume variants:\n"
        f"{headline_block}\n\n"
        f"Here are the summaries:\n"
        f"{summary_block}\n\n"
        f"Skills context: {skills_block}\n\n"
        "Synthesize the master headline and summary."
    )

    try:
        provider = get_ai_provider()
        model = get_model_for_tier("light")
        raw = await provider.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=0.3,
            max_tokens=1024,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            import re
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        return json.loads(cleaned.strip())
    except Exception as e:
        logger.warning("AI headline/summary synthesis failed: %s", e)
        # Fallback: pick the longest headline and summary
        best_headline = max(headlines, key=len) if headlines else ""
        best_summary = max(summaries, key=len) if summaries else ""
        return {"headline": best_headline, "summary": best_summary}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def build_profile_from_variants(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> ProfileBuildResult:
    """Build/enrich a user's profile by unioning data from all resume variants.

    Gap-fill only: existing profile data is preserved; only missing items are added.
    """
    # 1. Load all variants
    result = await db.execute(
        select(ResumeVariant)
        .where(ResumeVariant.user_id == user_id)
        .order_by(ResumeVariant.updated_at.desc())
    )
    variants = result.scalars().all()

    if not variants:
        return ProfileBuildResult(skipped_reason="No resume variants found")

    # 2. Get or create profile
    prof_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = prof_result.scalar_one_or_none()
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    # 3. Collect all data from variants
    all_skills: list[dict] = []
    all_experiences: list[dict] = []
    all_educations: list[dict] = []
    all_headlines: list[str] = []
    all_summaries: list[str] = []

    for v in variants:
        if v.skills:
            all_skills.extend(v.skills)
        if v.experiences:
            all_experiences.extend(v.experiences)
        if v.educations:
            all_educations.extend(v.educations)
        if v.headline:
            all_headlines.append(v.headline)
        if v.summary:
            all_summaries.append(v.summary)

    # 4. Cross-variant dedup (pick richest entry among duplicates)
    deduped_skills = _dedup_skills(all_skills)
    deduped_experiences = _dedup_experiences(all_experiences)
    deduped_educations = _dedup_educations(all_educations)

    # 5. Gap-fill: only add items not already in profile
    skills_added = 0
    experiences_added = 0
    educations_added = 0

    # Skills
    existing_skill_names = {s.skill_name.lower() for s in profile.skills}
    for s in deduped_skills:
        name = (s.get("skill_name") or "").strip()
        if not name or name.lower() in existing_skill_names:
            continue
        proficiency = s.get("proficiency_level", "intermediate")
        if proficiency not in ("beginner", "intermediate", "advanced", "expert"):
            proficiency = "intermediate"
        skill = ProfileSkill(
            profile_id=profile.id,
            skill_name=name,
            proficiency_level=proficiency,
            years_experience=s.get("years_experience"),
            source="resume",
        )
        db.add(skill)
        existing_skill_names.add(name.lower())
        skills_added += 1

    # Experiences
    existing_exp_keys = {
        f"{e.company.lower()}|{e.title.lower()}" for e in profile.experiences
    }
    for exp in deduped_experiences:
        company = (exp.get("company") or "").strip()
        title = (exp.get("title") or "").strip()
        if not company or not title:
            continue
        key = f"{company.lower()}|{title.lower()}"
        if key in existing_exp_keys:
            continue
        pe = ProfileExperience(
            profile_id=profile.id,
            company=company,
            title=title,
            description=exp.get("description"),
            start_date=_parse_date(exp.get("start_date")),
            end_date=_parse_date(exp.get("end_date")),
            is_current=bool(exp.get("is_current", False)),
        )
        db.add(pe)
        existing_exp_keys.add(key)
        experiences_added += 1

    # Educations
    existing_edu_keys = {
        f"{e.institution.lower()}|{(e.degree or '').lower()}" for e in profile.educations
    }
    for edu in deduped_educations:
        institution = (edu.get("institution") or "").strip()
        if not institution:
            continue
        degree = (edu.get("degree") or "").strip()
        key = f"{institution.lower()}|{degree.lower()}"
        if key in existing_edu_keys:
            continue
        pe = ProfileEducation(
            profile_id=profile.id,
            institution=institution,
            degree=degree or None,
            field_of_study=(edu.get("field_of_study") or "").strip() or None,
            graduation_date=_parse_date(edu.get("graduation_date")),
        )
        db.add(pe)
        existing_edu_keys.add(key)
        educations_added += 1

    # 6. Headline / summary gap-fill via AI
    headline_updated = False
    summary_updated = False

    needs_headline = not profile.headline and all_headlines
    needs_summary = not profile.summary and all_summaries

    if needs_headline or needs_summary:
        skill_names = [
            (s.get("skill_name") or "") for s in deduped_skills
        ]
        synthesized = await _synthesize_headline_summary(
            all_headlines, all_summaries, skill_names,
        )
        if needs_headline and synthesized.get("headline"):
            profile.headline = synthesized["headline"]
            headline_updated = True
        if needs_summary and synthesized.get("summary"):
            profile.summary = synthesized["summary"]
            summary_updated = True

    # 7. Commit + RAG re-index
    await db.commit()
    await db.refresh(profile)

    try:
        await index_profile(db, profile)
        await db.commit()
    except Exception:
        logger.warning("RAG re-index after profile build failed", exc_info=True)

    return ProfileBuildResult(
        skills_added=skills_added,
        experiences_added=experiences_added,
        educations_added=educations_added,
        headline_updated=headline_updated,
        summary_updated=summary_updated,
        variants_processed=len(variants),
    )
