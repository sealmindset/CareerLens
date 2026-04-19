"""Interview Prep Coach Agent -- stage-aware pre-interview preparation.

RAG sources: user's Interview Question Bank, Story Bank, Profile, target Job.
Produces four outputs per run:
  1. interview_prep_brief (markdown doc)
  2. interview_flashcards (JSON: array of {q,a,tag})
  3. interview_star_drafts (markdown)
  4. an AgentConversation seeded with a stage-aware interviewer opener

CRITICAL: Never fabricates content. The Interview Question Bank is treated as
a strong signal, not ground truth.
"""

from __future__ import annotations

import json
import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.errors import sanitize_ai_error
from app.ai.prompt_loader import get_prompt, get_prompt_config
from app.ai.provider import get_ai_provider, get_model_for_tier
from app.ai.sanitize import sanitize_prompt_input
from app.ai.validate import validate_agent_output
from app.models.agent_conversation import AgentConversation, AgentMessage
from app.models.interview_question import InterviewQuestion
from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import (
    AgentContext,
    format_job_context,
    format_profile_context_with_rag,
    format_story_bank_context,
)
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)

KNOWN_STAGES = {
    "recruiter_screen",
    "phone_screen",
    "hiring_manager",
    "technical",
    "panel",
    "final",
}

STAGE_KEYWORDS = {
    "recruiter_screen": ("recruiter", "screen", "screening", "hr"),
    "phone_screen": ("phone",),
    "hiring_manager": ("hiring manager", "hm"),
    "technical": ("technical", "coding", "system design", "tech"),
    "panel": ("panel",),
    "final": ("final", "executive", "onsite loop"),
}

MAX_QUESTION_BANK_ENTRIES = 40
SYSTEM_PROMPT_SLUG = "interview-prep-coach-system"


def _parse_stage_and_notes(text: str | None) -> tuple[str, str]:
    """Pull 'Stage: <value>' prefix out of additional_instructions.

    Returns (stage, remaining_notes). Stage defaults to 'recruiter_screen' if
    missing or unrecognized -- safer default than dumping technical prep on
    someone who's about to take a recruiter call.
    """
    if not text:
        return "recruiter_screen", ""

    m = re.match(r"\s*Stage:\s*([a-z_ ]+)\s*\n?", text, flags=re.IGNORECASE)
    if not m:
        return "recruiter_screen", text.strip()

    raw = m.group(1).strip().lower().replace(" ", "_")
    notes = text[m.end():].strip()
    if raw in KNOWN_STAGES:
        return raw, notes
    return "recruiter_screen", notes


def _matches_stage(bank_stage: str | None, target_stage: str) -> bool:
    if not bank_stage:
        return False
    s = bank_stage.strip().lower()
    if s == target_stage:
        return True
    for kw in STAGE_KEYWORDS.get(target_stage, ()):
        if kw in s:
            return True
    return False


async def _load_interview_questions(
    db: AsyncSession,
    user_id: uuid.UUID,
    company: str | None,
    stage: str,
) -> list[InterviewQuestion]:
    """Load user's question bank with stage/company-first ranking."""
    result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.user_id == user_id,
            InterviewQuestion.status == "active",
        )
    )
    all_rows = list(result.scalars().all())
    if not all_rows:
        return []

    company_lower = (company or "").lower().strip()

    def score(q: InterviewQuestion) -> int:
        s = 0
        if company_lower and q.company and company_lower in q.company.lower():
            s += 4
        if _matches_stage(q.interview_stage, stage):
            s += 2
        return s

    ranked = sorted(all_rows, key=lambda q: (-score(q), q.created_at or 0))
    return ranked[:MAX_QUESTION_BANK_ENTRIES]


def _format_question_bank(
    questions: list[InterviewQuestion],
    company: str | None,
    stage: str,
) -> str:
    if not questions:
        return ""

    parts = [
        "## User's Interview Question Bank (strong signal, not comprehensive)\n",
        f"Below are real interview questions the user has captured, ranked by "
        f"relevance to company='{company or 'unknown'}' and stage='{stage}'. "
        f"Use the most relevant ones to shape the prep brief, flashcards, and "
        f"mock-interview opener. Do not invent questions -- pull from this list.\n",
    ]

    for q in questions:
        tag_str = ""
        if q.topic_tags:
            tags = [str(t) for t in q.topic_tags[:5]]
            tag_str = f" [tags: {', '.join(tags)}]"
        header = f"**{q.company or 'Unknown co.'}"
        if q.role_title:
            header += f" / {q.role_title}"
        header += f"** (stage: {q.interview_stage or 'n/a'}){tag_str}"
        parts.append(header)
        parts.append(f"Q: {q.question_text.strip()}")
        if q.model_answer:
            preview = q.model_answer[:400]
            if len(q.model_answer) > 400:
                preview += "..."
            parts.append(f"Reference answer: {preview}")
        parts.append("")

    return "\n".join(parts)


def _parse_coach_response(raw: str) -> dict:
    """Extract the JSON blob the LLM returned. Be lenient about code fences."""
    text = raw.strip()
    # Strip ```json ... ``` or ``` ... ``` fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)

    # Find the first balanced { ... }
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        raise ValueError("No JSON object found in Interview Prep Coach response")

    blob = text[first : last + 1]
    try:
        return json.loads(blob)
    except json.JSONDecodeError as e:
        logger.warning("Prep coach JSON parse failed, attempting repair: %s", e)
        # Minimal repair: unescaped newlines inside strings are the usual failure
        repaired = re.sub(r"(?<!\\)\n", r"\\n", blob)
        return json.loads(repaired)


async def _get_or_seed_chat_conversation(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    job_id: uuid.UUID | None,
    stage: str,
    company: str | None,
    job_title: str | None,
    chat_opener: str,
) -> AgentConversation:
    """Find an existing prep-coach conversation for this workspace or create one.

    On first creation seeds a system-ish preamble as the first assistant
    message so the user immediately sees the stage-aware opener.
    """
    result = await db.execute(
        select(AgentConversation).where(
            AgentConversation.user_id == user_id,
            AgentConversation.workspace_id == workspace_id,
            AgentConversation.agent_name == "interview_prep_coach",
        )
    )
    convo = result.scalars().first()

    if not convo:
        convo = AgentConversation(
            user_id=user_id,
            agent_name="interview_prep_coach",
            context_type="interview_prep",
            workspace_id=workspace_id,
            job_id=job_id,
            status="active",
            draft_resume={
                "stage": stage,
                "company": company,
                "job_title": job_title,
            },
        )
        db.add(convo)
        await db.flush()

        opener_msg = AgentMessage(
            conversation_id=convo.id,
            role="assistant",
            content=chat_opener.strip() or
                "Hi! Let's start a mock interview. Tell me about yourself.",
        )
        db.add(opener_msg)
        await db.flush()
        await db.refresh(convo)
    else:
        # Keep metadata fresh on re-runs
        convo.draft_resume = {
            "stage": stage,
            "company": company,
            "job_title": job_title,
        }
        await db.flush()

    return convo


async def run_interview_prep_coach_task(
    context: AgentContext,
) -> list[WorkspaceArtifact]:
    """Generate prep brief + flashcards + STAR drafts + seed mock chat."""

    stage, user_notes = _parse_stage_and_notes(context.additional_instructions)
    company = context.job.company if context.job else None
    job_title = context.job.title if context.job else None

    # Retrieval
    questions = await _load_interview_questions(
        context.db, context.user_id, company, stage
    )

    # Build context parts
    parts: list[str] = []
    parts.append(f"## Interview Stage\n\nStage: **{stage}**")
    parts.append(format_job_context(context.job))

    rag_query = f"{job_title or ''} at {company or ''} {stage}"
    profile_ctx = await format_profile_context_with_rag(
        context.db, context.profile, rag_query
    )
    parts.append(profile_ctx)

    story_ctx = await format_story_bank_context(
        context.db, context.user_id, context.job
    )
    if story_ctx:
        parts.append(story_ctx)

    qb_ctx = _format_question_bank(questions, company, stage)
    if qb_ctx:
        parts.append(qb_ctx)

    if user_notes:
        parts.append(
            "## User's Notes For This Interview\n\n"
            + sanitize_prompt_input(user_notes)
        )

    parts.append(
        "## Your Task\n\n"
        "Generate the four-section JSON object described in the system prompt. "
        f"Stage is '{stage}'. Return raw JSON only -- no code fence."
    )

    user_prompt = "\n\n".join(parts)

    # Load prompt + config explicitly (batch prompt, not chat persona)
    system_prompt = await get_prompt(context.db, SYSTEM_PROMPT_SLUG, _FALLBACK_SYSTEM)
    temperature, max_tokens, model_tier = await get_prompt_config(
        context.db, SYSTEM_PROMPT_SLUG
    )

    try:
        provider = get_ai_provider()
        model = get_model_for_tier(model_tier)
        raw_response = await provider.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        response_text = validate_agent_output(raw_response)
    except Exception as e:
        safe = sanitize_ai_error(e)
        logger.error("Interview Prep Coach AI call failed: %s", str(e))
        raise RuntimeError(safe.message) from e

    parsed = _parse_coach_response(response_text)

    prep_brief_md = str(parsed.get("prep_brief_md") or "").strip()
    star_drafts_md = str(parsed.get("star_drafts_md") or "").strip()
    flashcards = parsed.get("flashcards") or []
    chat_opener = str(parsed.get("chat_opener") or "").strip()

    if not isinstance(flashcards, list):
        flashcards = []

    stage_label = stage.replace("_", " ").title()
    artifacts: list[WorkspaceArtifact] = []

    if prep_brief_md:
        a = await save_artifact(
            db=context.db,
            workspace_id=context.workspace_id,
            agent_name="interview_prep_coach",
            artifact_type="interview_prep_brief",
            title=f"Prep Brief: {stage_label} — {company or 'Role'}",
            content=prep_brief_md,
            content_format="markdown",
        )
        artifacts.append(a)

    if flashcards:
        a = await save_artifact(
            db=context.db,
            workspace_id=context.workspace_id,
            agent_name="interview_prep_coach",
            artifact_type="interview_flashcards",
            title=f"Flashcards: {stage_label} — {company or 'Role'}",
            content=json.dumps(flashcards, indent=2),
            content_format="json",
        )
        artifacts.append(a)

    if star_drafts_md:
        a = await save_artifact(
            db=context.db,
            workspace_id=context.workspace_id,
            agent_name="interview_prep_coach",
            artifact_type="interview_star_drafts",
            title=f"STAR Drafts: {stage_label} — {company or 'Role'}",
            content=star_drafts_md,
            content_format="markdown",
        )
        artifacts.append(a)

    # Seed the mock-interview conversation (only on first run; reuses on re-run)
    job_id = context.job.id if context.job else None
    await _get_or_seed_chat_conversation(
        db=context.db,
        user_id=context.user_id,
        workspace_id=context.workspace_id,
        job_id=job_id,
        stage=stage,
        company=company,
        job_title=job_title,
        chat_opener=chat_opener,
    )

    return artifacts


_FALLBACK_SYSTEM = (
    "You are Interview Prep Coach. Return ONE JSON object with keys "
    "prep_brief_md, flashcards (array of {q,a,tag}), star_drafts_md, "
    "chat_opener. Tailor the output to the given interview stage. Draw from "
    "the user's Interview Question Bank and Story Bank verbatim where possible. "
    "Never fabricate experience or metrics. Return raw JSON only."
)
