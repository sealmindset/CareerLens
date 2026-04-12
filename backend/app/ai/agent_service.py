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
    "talking_points": "talking-points-system",
    "experience_enhancer": "experience-enhancer-system",
}

# Default system prompts (fallback when DB has no published prompt)
# These incorporate T-shaped professional profiling: deep vertical expertise +
# broad horizontal competency discovery across all agents.
DEFAULT_PROMPTS = {
    "scout": (
        "You are Scout, a career research specialist for CareerLens.\n\n"
        "Your role is to analyze job listings against the user's profile, identify strong matches, "
        "discover hidden opportunities, and provide match scores with detailed explanations.\n\n"
        "## T-SHAPED PROFESSIONAL ANALYSIS\n\n"
        "When analyzing matches, evaluate the user's T-shaped profile against the role:\n"
        "- **Vertical Spike:** Identify the user's deep, specialized expertise and how it aligns "
        "with the role's core technical requirements\n"
        "- **Horizontal Bar:** Map the user's cross-functional knowledge to the role's breadth requirements\n"
        "- **Bridge Value:** Highlight where the user can translate between technical execution "
        "and business strategy\n"
        "- **Hidden Advantages:** Look for T-shape intersections that create unique value\n\n"
        "Match scores use a 0-100 scale:\n"
        "- Vertical Alignment (30%) | Horizontal Fit (25%) | Experience (20%) "
        "| Education (10%) | Culture & Growth (15%)\n\n"
        "Be specific and actionable. Use markdown formatting."
    ),
    "tailor": (
        "You are Tailor, a resume and cover letter specialist for CareerLens.\n\n"
        "Your role is to rewrite resumes and cover letters to authentically showcase the user's "
        "T-shaped professional profile while matching job listing requirements.\n\n"
        "## CRITICAL OUTPUT RULE\n\n"
        "When producing a tailored resume, the output must be a CLEAN, SUBMISSION-READY document. "
        "Do NOT include any commentary, rationale, analysis, notes, explanations, blockquotes, "
        "or 'why this matters' annotations mixed into the resume. No text starting with '>'. "
        "The resume should look exactly like what a candidate would submit to an employer or ATS.\n\n"
        "## T-SHAPED RESUME STRATEGY\n\n"
        "**Professional Summary (auto-generate):**\n"
        "\"Results-driven [Core Specialization] with deep expertise in [Vertical Spike] "
        "combined with broad competency across [Horizontal Areas]. Proven ability to bridge "
        "technical execution and business strategy, driving [key outcome].\"\n\n"
        "**Experience:** Lead with vertical spike achievements, follow with horizontal impact. "
        "Use verbs: architected, optimized, translated, collaborated, drove, bridged, spearheaded.\n\n"
        "RULES: NEVER fabricate experience. Reframe to highlight T-shape naturally. "
        "Optimize for ATS. Quantify achievements. Use markdown formatting. "
        "NEVER include commentary or rationale inside the resume output."
    ),
    "coach": (
        "You are Coach, an interview preparation specialist for CareerLens.\n\n"
        "Prepare users to articulate their T-shaped professional value in interviews.\n\n"
        "Blend STAR method with T-shape discovery:\n"
        "- **Vertical Depth:** \"Walk me through the most technically complex problem you solved.\"\n"
        "- **Horizontal Breadth:** \"Tell me about cross-functional collaboration.\"\n"
        "- **Bridge Questions:** \"Give an example where broad knowledge helped you solve "
        "a problem a pure specialist might have missed.\"\n\n"
        "Help users structure answers showcasing both depth AND breadth. "
        "Be encouraging but honest."
    ),
    "strategist": (
        "You are Strategist, a career planning advisor for CareerLens.\n\n"
        "Advise on career moves through the lens of building a T-shaped professional profile.\n\n"
        "- Assess the user's vertical spike (deep expertise) and horizontal bar (breadth)\n"
        "- Recommend depth-building AND breadth-building career moves\n"
        "- T-shaped professionals command premium compensation -- help users articulate this\n"
        "- Map career trajectories: IC, Management, Executive, or Entrepreneur track\n\n"
        "Be data-informed when possible and transparent when speculating."
    ),
    "brand_advisor": (
        "You are Brand Advisor, a personal branding specialist for CareerLens.\n\n"
        "Build the user's professional brand around their T-shaped profile.\n\n"
        "LinkedIn Headline: \"[Vertical Spike] | [Horizontal Value Props] | [Impact Statement]\"\n"
        "Summary: Hook -> Vertical Proof -> Horizontal Proof -> Bridge Statement -> CTA\n\n"
        "Key: NOT a jack-of-all-trades -- a recognized expert who ALSO understands adjacent domains. "
        "Focus on authenticity and professional differentiation."
    ),
    "coordinator": (
        "You are Coordinator, an application process manager for CareerLens.\n\n"
        "Orchestrate applications with T-shaped positioning in mind:\n"
        "- **Best Matches:** Vertical spike = core requirement AND horizontal bar adds bonus value\n"
        "- **Growth Matches:** Leverage horizontal bar while deepening vertical spike\n"
        "- **Stretch Matches:** Have breadth, building depth -- position as \"deep enough + uniquely broad\"\n\n"
        "Be organized, systematic, and proactive about deadlines."
    ),
    "talking_points": (
        "You are Talking Points, an interview story specialist for CareerLens.\n\n"
        "Your role is to transform resume bullet points into compelling, conversational interview "
        "stories using the Problem-Solved-Deployed framework.\n\n"
        "## STORY FRAMEWORK\n\n"
        "Every story follows three beats:\n"
        "- **Problem (The Hook):** A situation the interviewer recognizes -- makes them lean in\n"
        "- **Solved (The Differentiator):** Shows judgment, approach, and tradeoffs -- not just what happened\n"
        "- **Deployed (The Proof):** Numbers, outcomes, cultural shifts -- what the interviewer remembers\n\n"
        "## TONE\n\n"
        "- First person, natural, conversational -- like riffing with a sharp colleague\n"
        "- Each story runs 90 seconds to 3-4 minutes depending on engagement\n"
        "- No corporate jargon. Specific technologies and real numbers.\n"
        "- Core takeaways flow naturally from the story, never bolted on\n\n"
        "## RULES\n\n"
        "- NEVER fabricate experiences, numbers, or outcomes\n"
        "- Use the tailored resume as the bullet source and variant data for enrichment\n"
        "- Cover every bullet point -- no skipping\n"
        "- Mark uncertain details with [verify with candidate]\n"
        "- Use markdown formatting."
    ),
    "experience_enhancer": (
        "You are an Experience Enhancer AI assistant for CareerLens.\n\n"
        "Help users write compelling descriptions by discovering their T-shaped professional value.\n\n"
        "## T-SHAPED DISCOVERY\n"
        "Blend STAR method with T-shape questions:\n"
        "- Vertical: \"What was your deepest expertise? What problems did only YOU solve?\"\n"
        "- Horizontal: \"What teams outside your core function did you work with?\"\n"
        "- Bridge: \"Describe when specialized knowledge solved a cross-team problem.\"\n\n"
        "## ENHANCEMENT\n"
        "- Lead bullets with vertical spike achievements\n"
        "- Include horizontal impact bullets\n"
        "- Use verbs: architected, optimized, translated, collaborated, bridged, orchestrated\n"
        "- Quantify results. Structure: deep expertise -> broad application -> business impact\n\n"
        "RULES: NEVER fabricate. Ask clarifying questions. 3-5 bullet points. Use markdown."
    ),
}


async def _build_application_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> str:
    """Build context string from the application's job listing, user profile, and workspace artifacts."""
    from app.services.agents.base import format_job_context, format_profile_context, format_profile_context_with_rag
    from app.services.workspace_service import build_workspace_context

    parts = []

    # Load profile
    prof_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = prof_result.scalar_one_or_none()

    # Load application for RAG query context
    app_result_for_rag = await db.execute(
        select(Application).where(Application.id == application_id)
    )
    app_for_rag = app_result_for_rag.scalar_one_or_none()

    if profile:
        # Use RAG if we have job context for the query
        if app_for_rag and app_for_rag.job_listing:
            job = app_for_rag.job_listing
            rag_query = f"{job.title} at {job.company}"
            if job.description:
                rag_query += " " + job.description[:500]
            parts.append(await format_profile_context_with_rag(db, profile, rag_query))
        else:
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


async def generate_experience_assist(
    db: AsyncSession,
    action: str,
    experience_context: str,
    profile_context: str,
    custom_message: str | None = None,
    conversation_history: list[tuple[str, str]] | None = None,
) -> str:
    """Generate an AI response to assist with an experience entry, with optional conversation history."""
    slug = AGENT_SLUGS["experience_enhancer"]
    fallback = DEFAULT_PROMPTS["experience_enhancer"]

    system_prompt = await get_prompt(db, slug, fallback)
    temperature, max_tokens, model_tier = await get_prompt_config(db, slug)

    # IMPORTANT: All actions that produce a rewritten/enhanced description MUST wrap it
    # in ===DESCRIPTION=== / ===END_DESCRIPTION=== tags so the frontend can extract it.
    # Chat responses that include a revised description should also use these tags.
    desc_tag_instructions = (
        "\n\nCRITICAL FORMATTING RULE: Whenever you produce a rewritten or revised experience "
        "description (title, dates, bullet points), you MUST wrap ONLY the description in these exact tags:\n"
        "===DESCRIPTION===\n"
        "Title | Company\n"
        "Date Range\n"
        "\u2022 Bullet one...\n"
        "\u2022 Bullet two...\n"
        "===END_DESCRIPTION===\n\n"
        "Put your commentary, refinements list, and follow-up questions OUTSIDE these tags. "
        "Never put commentary inside the tags. Never put the tags around advice or reviews."
    )

    action_instructions = {
        "enhance": (
            "The user wants you to enhance this experience description. "
            "Rewrite it with stronger action verbs, quantified results where possible, "
            "and clear impact statements.\n\n"
            "Format your response as:\n"
            "1. The enhanced description wrapped in ===DESCRIPTION=== / ===END_DESCRIPTION=== tags\n"
            "2. A concise list of key refinements made (using \u2728 emoji per item)\n"
            "3. 1-2 follow-up questions asking if the user wants adjustments\n\n"
            "No preamble before the description tags. Start directly with ===DESCRIPTION===."
            + desc_tag_instructions
        ),
        "interview": (
            "Ask the user 3-5 targeted interview-style questions about this role "
            "to help them recall specific accomplishments, metrics, and impact. "
            "Blend STAR method (Situation, Task, Action, Result) with T-shaped discovery:\n\n"
            "Include at least:\n"
            "- 1 VERTICAL DEPTH question: probe their deepest expertise in this role "
            "(e.g., 'What technical problems did only you know how to solve?')\n"
            "- 1 HORIZONTAL BREADTH question: probe cross-functional impact "
            "(e.g., 'What teams outside your core function did you collaborate with?')\n"
            "- 1 BRIDGE question: probe where depth met breadth to create unique value "
            "(e.g., 'Describe when your specialized knowledge solved a cross-team problem.')\n"
            "- 1-2 STAR questions focused on quantifiable achievements and impact\n\n"
            "Focus on areas where the description could be strengthened. "
            "Do NOT produce a rewritten description. Do NOT use ===DESCRIPTION=== tags."
        ),
        "improve": (
            "Review this experience description and provide specific, actionable suggestions "
            "for improvement through a T-shaped professional lens.\n\n"
            "Evaluate:\n"
            "- Does it showcase VERTICAL DEPTH? (specialized expertise, technical authority)\n"
            "- Does it demonstrate HORIZONTAL BREADTH? (cross-functional impact, collaboration)\n"
            "- Does it highlight BRIDGE VALUE? (translating between technical and business)\n"
            "- Are achievements quantified with metrics and impact?\n"
            "- Does it use strong action verbs that convey both depth and breadth?\n\n"
            "Suggest specific improvements for each gap found. Don't rewrite it -- advise. "
            "Do NOT produce a rewritten description. Do NOT use ===DESCRIPTION=== tags."
        ),
    }

    # For chat messages, include the tag instructions so the AI uses them
    # when the user asks for a rewrite during conversation
    chat_tag_instructions = desc_tag_instructions

    instruction = action_instructions.get(action, "")

    prompt_parts = [profile_context, experience_context]

    # Include conversation history so the AI has context for follow-ups
    if conversation_history:
        history_lines = []
        for role, content in conversation_history:
            if role == "user":
                history_lines.append(f"User: {content}")
            else:
                history_lines.append(f"Assistant: {content}")
        prompt_parts.append("Previous conversation:\n" + "\n".join(history_lines))

    if instruction:
        prompt_parts.append(instruction)
    if custom_message:
        prompt_parts.append(f"User message: {sanitize_prompt_input(custom_message)}")
    # For chat action, include tag instructions so AI tags any descriptions it produces
    if action == "chat":
        prompt_parts.append(chat_tag_instructions)

    user_prompt = "\n\n".join(prompt_parts)

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
        logger.error("AI provider error for experience_enhancer: %s", str(e))
        return safe_error.message


async def generate_brand_assist(
    db: AsyncSession,
    field: str,
    action: str,
    profile_context: str,
    custom_message: str | None = None,
    conversation_history: list[tuple[str, str]] | None = None,
) -> str:
    """Generate AI-powered headline or summary using the Brand Advisor agent."""
    slug = AGENT_SLUGS["brand_advisor"]
    fallback = DEFAULT_PROMPTS["brand_advisor"]

    system_prompt = await get_prompt(db, slug, fallback)
    temperature, max_tokens, model_tier = await get_prompt_config(db, slug)

    tag_start = "===HEADLINE===" if field == "headline" else "===SUMMARY==="
    tag_end = "===END_HEADLINE===" if field == "headline" else "===END_SUMMARY==="

    tag_instructions = (
        f"\n\nCRITICAL FORMATTING RULE: Whenever you produce a generated or revised {field}, "
        f"you MUST wrap ONLY the {field} text in these exact tags:\n"
        f"{tag_start}\n"
        f"Your {field} text here\n"
        f"{tag_end}\n\n"
        f"Put your commentary, rationale, and follow-up questions OUTSIDE these tags. "
        f"Never put commentary inside the tags."
    )

    if field == "headline":
        generate_instructions = (
            "The user wants you to craft a powerful professional headline (max 220 characters).\n\n"
            "Use this formula: [Job Title] | [Key Skill/Tool] | [Unique Value Proposition or Result]\n\n"
            "Requirements:\n"
            "- Clear, concise, and keyword-rich for recruiter searchability\n"
            "- Combine their job title, key skills, and the value they provide\n"
            "- Reflect their T-shaped profile: vertical spike expertise + horizontal breadth\n"
            "- Use industry-specific keywords naturally\n"
            "- Max 220 characters\n\n"
            "Base the headline on their actual experience, skills, and resume data. "
            "Do NOT fabricate titles or skills they don't have.\n\n"
            "Format your response as:\n"
            f"1. The headline wrapped in {tag_start} / {tag_end} tags\n"
            "2. Brief rationale for your choices (2-3 bullet points)\n"
            "3. 1-2 alternative headline options for consideration\n"
            + tag_instructions
        )
    else:
        generate_instructions = (
            "The user wants you to craft a high-impact professional summary.\n\n"
            "Structure: Hook → Vertical Proof → Horizontal Proof → Bridge Statement → CTA\n\n"
            "Requirements:\n"
            "- Quantify brand equity, impact, and results with data-driven metrics\n"
            "- Blend technical/specialized skills with strategic business understanding\n"
            "- Highlight experience scope: product launches, cross-functional leadership, revenue growth\n"
            "- Include quantifiable results: percentages, dollar figures, growth metrics\n"
            "- Key skills to weave in: data analysis, digital platforms, product development, "
            "brand strategy, market positioning, cross-functional leadership, consumer insights\n"
            "- 3-5 sentences that give the reader a clear sense of who they are, what they bring, "
            "and envisions them working there\n"
            "- NOT a jack-of-all-trades — a recognized expert who ALSO understands adjacent domains\n\n"
            "Base the summary on their actual experience, skills, and resume data. "
            "Extrapolate reasonable metrics from their experience descriptions where possible, "
            "but do NOT fabricate specific numbers they haven't mentioned.\n\n"
            "Format your response as:\n"
            f"1. The summary wrapped in {tag_start} / {tag_end} tags\n"
            "2. Brief rationale for key choices (2-3 bullet points)\n"
            "3. 1-2 follow-up questions to refine further\n"
            + tag_instructions
        )

    prompt_parts = [profile_context]

    if conversation_history:
        history_lines = []
        for role, content in conversation_history:
            if role == "user":
                history_lines.append(f"User: {content}")
            else:
                history_lines.append(f"Assistant: {content}")
        prompt_parts.append("Previous conversation:\n" + "\n".join(history_lines))

    if action == "generate":
        prompt_parts.append(generate_instructions)
    elif action == "chat" and custom_message:
        prompt_parts.append(f"User message: {sanitize_prompt_input(custom_message)}")
        prompt_parts.append(tag_instructions)

    user_prompt = "\n\n".join(prompt_parts)

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
        logger.error("AI provider error for brand_advisor (%s): %s", field, str(e))
        return safe_error.message


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
