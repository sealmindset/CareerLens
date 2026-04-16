"""Outlier detector -- compares JD requirements against profile + Story Bank.

Identifies skills in the JD that the user may have experience with but aren't
reflected in their resume or story bank, prompting them to fill the gap before
the Tailor agent runs.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile, ProfileSkill
from app.models.story_bank import StoryBankStory

logger = logging.getLogger(__name__)


async def detect_outliers(
    db: AsyncSession, user_id: uuid.UUID, requirements: list[dict]
) -> list[dict]:
    """Compare parsed JD requirements against the user's profile and Story Bank.

    Returns the requirements list enriched with:
    - outlier: bool (true if no match found)
    - matched_in: "profile" | "story_bank" | None
    - story_id: UUID string if matched in Story Bank
    """
    # 1. Build the corpus from profile
    profile_corpus = ""
    prof_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = prof_result.scalar_one_or_none()

    if profile:
        parts = []
        if profile.raw_resume_text:
            parts.append(profile.raw_resume_text)
        if profile.summary:
            parts.append(profile.summary)
        if profile.headline:
            parts.append(profile.headline)
        for exp in profile.experiences:
            parts.append(f"{exp.title} {exp.company}")
            if exp.description:
                parts.append(exp.description)
        profile_corpus = " ".join(parts).lower()

    # Load profile skills separately for exact matching
    skill_names: list[str] = []
    if profile:
        skill_result = await db.execute(
            select(ProfileSkill).where(ProfileSkill.profile_id == profile.id)
        )
        skill_names = [s.skill_name.lower() for s in skill_result.scalars().all()]

    # 2. Build corpus from Story Bank
    story_result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.user_id == user_id,
            StoryBankStory.status == "active",
        )
    )
    stories = story_result.scalars().all()

    story_corpus_parts: list[str] = []
    # Map keyword -> story for matching
    keyword_story_map: dict[str, StoryBankStory] = {}
    for story in stories:
        story_text = " ".join(filter(None, [
            story.story_title,
            story.problem,
            story.solved,
            story.deployed,
            story.takeaway,
            story.source_bullet,
        ])).lower()
        story_corpus_parts.append(story_text)

        # Index trigger keywords
        if story.trigger_keywords:
            for kw in story.trigger_keywords:
                keyword_story_map[kw.lower()] = story

    story_corpus = " ".join(story_corpus_parts)

    # 3. Check each requirement against both corpora
    enriched = []
    for req in requirements:
        text = req.get("text", "")
        req_type = req.get("type", "required")

        if not text:
            continue

        result = {
            "text": text,
            "type": req_type,
            "outlier": True,
            "matched_in": None,
            "story_id": None,
        }

        # Extract searchable terms from the requirement
        search_terms = _extract_search_terms(text)

        # Check Story Bank first (more specific match)
        matched_story = _check_corpus_match(search_terms, story_corpus, keyword_story_map)
        if matched_story:
            result["outlier"] = False
            result["matched_in"] = "story_bank"
            result["story_id"] = str(matched_story.id)
            enriched.append(result)
            continue

        # Check profile corpus
        if _check_profile_match(search_terms, profile_corpus, skill_names):
            result["outlier"] = False
            result["matched_in"] = "profile"
            enriched.append(result)
            continue

        enriched.append(result)

    return enriched


def _extract_search_terms(requirement_text: str) -> list[str]:
    """Extract meaningful search terms from a requirement string.

    Splits on common delimiters and filters out generic words.
    """
    import re

    # Common filler words that don't help with matching
    stop_words = {
        "experience", "with", "and", "or", "the", "in", "of", "to", "a", "an",
        "for", "is", "are", "have", "has", "had", "be", "been", "being",
        "years", "year", "strong", "preferred", "required", "knowledge",
        "understanding", "ability", "skills", "skill", "proven", "demonstrated",
        "working", "work", "using", "use", "including", "such", "as",
        "minimum", "plus", "equivalent", "related", "relevant", "similar",
        "must", "should", "will", "can", "able", "familiar", "familiarity",
    }

    # Split on common delimiters
    text = requirement_text.lower()
    # Preserve compound terms like "snyk.io", "ci/cd", "aws-lambda"
    tokens = re.split(r'[,;()\s]+', text)
    # Also keep multi-word tech terms together
    terms = [t.strip() for t in tokens if t.strip() and t.strip() not in stop_words and len(t.strip()) > 1]

    return terms


def _check_corpus_match(
    search_terms: list[str],
    story_corpus: str,
    keyword_story_map: dict[str, "StoryBankStory"],
) -> "StoryBankStory | None":
    """Check if any search term matches in the Story Bank corpus."""
    for term in search_terms:
        # Check trigger keyword index first (exact match)
        if term in keyword_story_map:
            return keyword_story_map[term]
        # Check full corpus (substring match)
        if term in story_corpus:
            # Find which story contains this term
            for kw, story in keyword_story_map.items():
                story_text = " ".join(filter(None, [
                    story.story_title,
                    story.problem,
                    story.solved,
                    story.deployed,
                ])).lower()
                if term in story_text:
                    return story
    return None


def _check_profile_match(
    search_terms: list[str],
    profile_corpus: str,
    skill_names: list[str],
) -> bool:
    """Check if any search term matches in the profile corpus."""
    for term in search_terms:
        # Check exact skill names first
        if term in skill_names:
            return True
        # Check if any skill name contains the term or vice versa
        for skill in skill_names:
            if term in skill or skill in term:
                return True
        # Check full profile corpus
        if len(term) >= 3 and term in profile_corpus:
            return True
    return False
