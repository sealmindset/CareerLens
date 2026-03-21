"""Shared utilities for agent task runners."""

import json
import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.errors import sanitize_ai_error
from app.ai.prompt_loader import get_prompt, get_prompt_config
from app.ai.provider import get_ai_provider, get_model_for_tier
from app.ai.sanitize import sanitize_prompt_input
from app.ai.validate import validate_agent_output
from app.models.application import Application
from app.models.job import JobListing
from app.models.profile import Profile
from app.models.workspace import WorkspaceArtifact
from app.services.rag_service import format_rag_context, retrieve_relevant_chunks
from app.services.workspace_service import build_workspace_context, get_artifacts, save_artifact

logger = logging.getLogger(__name__)


@dataclass
class AgentContext:
    """All the data an agent might need, pre-loaded."""
    db: AsyncSession
    user_id: uuid.UUID
    workspace_id: uuid.UUID
    application: Application
    job: JobListing
    profile: Profile | None
    workspace_artifacts: list[WorkspaceArtifact]
    additional_instructions: str | None = None


async def load_agent_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    application_id: uuid.UUID,
    additional_instructions: str | None = None,
) -> AgentContext:
    """Load all context data an agent might need."""
    # Load application with job
    app_result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = app_result.scalar_one()
    job = application.job_listing

    # Load profile
    prof_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = prof_result.scalar_one_or_none()

    # Load existing workspace artifacts
    artifacts = await get_artifacts(db, workspace_id)

    return AgentContext(
        db=db,
        user_id=user_id,
        workspace_id=workspace_id,
        application=application,
        job=job,
        profile=profile,
        workspace_artifacts=artifacts,
        additional_instructions=additional_instructions,
    )


def format_profile_context(profile: Profile | None) -> str:
    """Format profile data as context for an agent prompt."""
    if not profile:
        return "No profile data available."

    parts = ["## Candidate Profile\n"]

    if profile.headline:
        parts.append(f"**Headline:** {profile.headline}")
    if profile.summary:
        parts.append(f"**Summary:** {profile.summary}")

    if profile.skills:
        skills_text = ", ".join(
            f"{s.skill_name} ({s.proficiency_level})"
            for s in profile.skills
        )
        parts.append(f"**Skills:** {skills_text}")

    if profile.experiences:
        parts.append("\n**Experience:**")
        for exp in profile.experiences:
            current = " (current)" if exp.is_current else ""
            dates = ""
            if exp.start_date:
                dates = f" ({exp.start_date}"
                dates += f" - {exp.end_date})" if exp.end_date else " - present)"
            parts.append(f"- **{exp.title}** at {exp.company}{dates}{current}")
            if exp.description:
                parts.append(f"  {exp.description}")

    if profile.educations:
        parts.append("\n**Education:**")
        for edu in profile.educations:
            degree = f"{edu.degree} in " if edu.degree else ""
            field = edu.field_of_study or ""
            parts.append(f"- {degree}{field} at {edu.institution}")

    if profile.raw_resume_text:
        # Include a trimmed version of the raw resume
        resume_preview = profile.raw_resume_text[:2000]
        if len(profile.raw_resume_text) > 2000:
            resume_preview += "\n[... resume continues ...]"
        parts.append(f"\n**Raw Resume Text:**\n{resume_preview}")

    return "\n".join(parts)


async def format_profile_context_with_rag(
    db: AsyncSession,
    profile: Profile | None,
    query: str,
) -> str:
    """Format profile context using RAG retrieval for relevant content.

    Falls back to the standard format_profile_context if no chunks are indexed.
    """
    if not profile:
        return "No profile data available."

    try:
        chunks = await retrieve_relevant_chunks(db, profile.id, query)
        if chunks:
            return format_rag_context(chunks)
    except Exception as e:
        logger.warning("RAG retrieval failed, falling back to standard context: %s", e)

    # Fallback to standard (truncated) context
    return format_profile_context(profile)


def format_job_context(job: JobListing) -> str:
    """Format job listing data as context for an agent prompt."""
    parts = ["## Target Job\n"]
    parts.append(f"**Title:** {job.title}")
    parts.append(f"**Company:** {job.company}")

    if job.location:
        parts.append(f"**Location:** {job.location}")
    if job.salary_range:
        parts.append(f"**Salary:** {job.salary_range}")
    if job.job_type:
        parts.append(f"**Type:** {job.job_type}")
    if job.url:
        parts.append(f"**URL:** {job.url}")

    if job.description:
        desc = job.description[:3000]
        if len(job.description) > 3000:
            desc += "\n[... description continues ...]"
        parts.append(f"\n**Description:**\n{desc}")

    if job.requirements:
        parts.append("\n**Requirements:**")
        for req in job.requirements:
            met_status = ""
            if req.is_met is True:
                met_status = " [MET]"
            elif req.is_met is False:
                met_status = " [GAP]"
            parts.append(f"- [{req.requirement_type}] {req.requirement_text}{met_status}")
            if req.gap_notes:
                parts.append(f"  Note: {req.gap_notes}")

    return "\n".join(parts)


async def call_agent_ai(
    db: AsyncSession,
    agent_name: str,
    task_prompt: str,
    context: AgentContext,
) -> str:
    """Call the AI provider with the agent's system prompt + task context."""
    from app.ai.agent_service import AGENT_SLUGS, DEFAULT_PROMPTS

    slug = AGENT_SLUGS.get(agent_name, f"{agent_name}-system")
    fallback = DEFAULT_PROMPTS.get(agent_name, DEFAULT_PROMPTS["scout"])

    system_prompt = await get_prompt(db, slug, fallback)
    temperature, max_tokens, model_tier = await get_prompt_config(db, slug)

    # Build the full user prompt with all context
    parts = []

    # Build a RAG query from job title + description for relevance
    rag_query = f"{context.job.title} at {context.job.company}"
    if context.job.description:
        rag_query += " " + context.job.description[:500]

    # Add profile context (RAG-enhanced when available)
    profile_ctx = await format_profile_context_with_rag(
        context.db, context.profile, rag_query
    )
    parts.append(profile_ctx)

    # Add job context
    parts.append(format_job_context(context.job))

    # Add workspace context from other agents
    workspace_ctx = build_workspace_context(context.workspace_artifacts)
    if workspace_ctx:
        parts.append(workspace_ctx)

    # Add the specific task
    parts.append(f"## Your Task\n\n{task_prompt}")

    # Add any user-provided instructions
    if context.additional_instructions:
        sanitized = sanitize_prompt_input(context.additional_instructions)
        parts.append(f"\n## Additional Instructions from User\n\n{sanitized}")

    user_prompt = "\n\n".join(parts)

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
        return validate_agent_output(raw_response)
    except Exception as e:
        safe_error = sanitize_ai_error(e)
        logger.error("AI provider error for agent '%s' task: %s", agent_name, str(e))
        raise RuntimeError(safe_error.message) from e
