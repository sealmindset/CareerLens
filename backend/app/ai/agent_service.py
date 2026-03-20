import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.errors import sanitize_ai_error
from app.ai.prompt_loader import get_prompt, get_prompt_config
from app.ai.provider import get_ai_provider, get_model_for_tier
from app.ai.sanitize import sanitize_prompt_input
from app.ai.validate import validate_agent_output
from app.models.agent_conversation import AgentMessage
from app.models.application import Application
from app.models.profile import Profile
from app.models.workspace import AgentWorkspace, WorkspaceArtifact

logger = logging.getLogger(__name__)

# Agent name -> system prompt slug mapping
AGENT_SLUGS = {
    "scout": "scout-system",
    "tailor": "tailor-system",
    "coach": "coach-system",
    "strategist": "strategist-system",
    "brand_advisor": "brand-advisor-system",
    "coordinator": "coordinator-system",
}

# Default system prompts (fallback when DB has no published prompt)
DEFAULT_PROMPTS = {
    "scout": (
        "You are Scout, a career research specialist for CareerLens. "
        "Your role is to analyze job listings against the user's profile, identify strong matches, "
        "discover hidden opportunities, and provide match scores with detailed explanations. "
        "When analyzing a job listing, compare requirements against the user's skills, experience, "
        "and education. Highlight strengths, identify gaps, and suggest how to position the application. "
        "Be specific and actionable in your advice. Use markdown formatting for readability."
    ),
    "tailor": (
        "You are Tailor, a resume and cover letter specialist for CareerLens. "
        "Your role is to rewrite resumes and cover letters to authentically match the language, "
        "keywords, and requirements of specific job listings. Never fabricate experience -- "
        "reframe existing experience to highlight relevant skills. "
        "Preserve the user's voice while optimizing for ATS (Applicant Tracking Systems). "
        "Quantify achievements where possible. Use markdown formatting."
    ),
    "coach": (
        "You are Coach, an interview preparation specialist for CareerLens. "
        "Your role is to prepare users for interviews with targeted practice questions, "
        "feedback on answers, and gap analysis. Ask behavioral and technical questions "
        "relevant to the target role. Provide constructive feedback using the STAR method. "
        "Identify weak areas and suggest improvement strategies. Be encouraging but honest."
    ),
    "strategist": (
        "You are Strategist, a career planning advisor for CareerLens. "
        "Your role is to advise on career moves, salary negotiation, and long-term career planning. "
        "Analyze market trends, compensation benchmarks, and career trajectories. "
        "Help users evaluate offers, plan career transitions, and set professional goals. "
        "Be data-informed when possible and transparent when speculating."
    ),
    "brand_advisor": (
        "You are Brand Advisor, a personal branding specialist for CareerLens. "
        "Your role is to improve the user's LinkedIn profile, online presence, and personal brand strategy. "
        "Review and suggest improvements to headlines, summaries, experience descriptions, "
        "and recommendations. Advise on content strategy, networking, and visibility. "
        "Focus on authenticity and professional differentiation."
    ),
    "coordinator": (
        "You are Coordinator, an application process manager for CareerLens. "
        "Your role is to orchestrate the application process: help organize applications, "
        "track deadlines, plan follow-ups, and manage the pipeline. "
        "Provide reminders, suggest next actions, and help prioritize applications "
        "based on match scores and deadlines. Be organized and systematic."
    ),
}


async def _build_application_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> str:
    """Build context string from the application's job listing, user profile, and workspace artifacts."""
    from app.services.agents.base import format_job_context, format_profile_context
    from app.services.workspace_service import build_workspace_context

    parts = []

    # Load profile
    prof_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = prof_result.scalar_one_or_none()
    if profile:
        parts.append(format_profile_context(profile))

    # Load application with job listing
    app_result = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    application = app_result.scalar_one_or_none()
    if application and application.job_listing:
        parts.append(format_job_context(application.job_listing))

    # Load workspace artifacts
    ws_result = await db.execute(
        select(AgentWorkspace).where(AgentWorkspace.application_id == application_id)
    )
    workspace = ws_result.scalar_one_or_none()
    if workspace:
        art_result = await db.execute(
            select(WorkspaceArtifact)
            .where(WorkspaceArtifact.workspace_id == workspace.id)
            .order_by(WorkspaceArtifact.created_at.asc())
        )
        artifacts = list(art_result.scalars().all())
        ws_context = build_workspace_context(artifacts)
        if ws_context:
            parts.append(ws_context)

    return "\n\n".join(parts)


async def generate_agent_response(
    db: AsyncSession,
    agent_name: str,
    conversation_id: str,
    user_message: str,
    application_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> str:
    """Generate an AI response for the given agent and conversation.

    1. Load system prompt from DB (or fallback)
    2. Build application context (if conversation is scoped to an application)
    3. Build conversation history
    4. Sanitize user input
    5. Call AI provider
    6. Validate and return response
    """
    slug = AGENT_SLUGS.get(agent_name, f"{agent_name}-system")
    fallback = DEFAULT_PROMPTS.get(agent_name, DEFAULT_PROMPTS["scout"])

    # Load system prompt and config from managed prompts
    system_prompt = await get_prompt(db, slug, fallback)
    temperature, max_tokens, model_tier = await get_prompt_config(db, slug)

    # Build application context if this conversation is scoped to a job application
    app_context = ""
    if application_id and user_id:
        app_context = await _build_application_context(db, user_id, application_id)

    # Build conversation history for context
    result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conversation_id)
        .order_by(AgentMessage.created_at.asc())
    )
    history = result.scalars().all()

    # Build the user prompt with conversation context
    context_parts = []
    # Include last 10 messages for context window management
    recent_history = list(history)[-10:]
    for msg in recent_history:
        if msg.role == "user":
            context_parts.append(f"User: {msg.content}")
        elif msg.role == "assistant":
            context_parts.append(f"Assistant: {msg.content}")

    # Sanitize and add the new user message
    sanitized_input = sanitize_prompt_input(user_message)

    # Assemble the full user prompt
    prompt_parts = []

    if app_context:
        prompt_parts.append(app_context)

    if context_parts:
        prompt_parts.append(
            "Previous conversation:\n" + "\n".join(context_parts)
        )
        prompt_parts.append("New message from user:\n" + sanitized_input)
    else:
        prompt_parts.append(sanitized_input)

    user_prompt = "\n\n".join(prompt_parts)

    # Call AI provider
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
        logger.error("AI provider error for agent '%s': %s", agent_name, str(e))
        return safe_error.message
