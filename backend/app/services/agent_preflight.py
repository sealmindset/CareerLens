"""Agent preflight checks -- verify each agent has the data it needs.

Each agent has specific data requirements. The preflight system checks
availability and guides the user to provide missing data (never blocks).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application
from app.models.job import JobListing
from app.models.profile import Profile
from app.models.workspace import AgentWorkspace, WorkspaceArtifact
from app.schemas.workspace import PreflightItem, PreflightResult


def _profile_check(profile: Profile | None) -> list[PreflightItem]:
    """Check profile completeness."""
    items = []

    if not profile:
        items.append(PreflightItem(
            name="Profile",
            description="Your career profile",
            status="missing",
            source="profile",
            detail="Go to My Profile and fill in your headline and summary.",
        ))
        return items

    if not profile.headline:
        items.append(PreflightItem(
            name="Headline",
            description="A short professional headline",
            status="missing",
            source="profile",
            detail="Add a headline on your Profile page (e.g., 'Senior Software Engineer').",
        ))

    if not profile.summary:
        items.append(PreflightItem(
            name="Summary",
            description="A professional summary paragraph",
            status="missing",
            source="profile",
            detail="Add a summary on your Profile page describing your career focus.",
        ))

    if not profile.skills or len(profile.skills) < 3:
        count = len(profile.skills) if profile.skills else 0
        items.append(PreflightItem(
            name="Skills",
            description=f"Your professional skills ({count} found, 3+ recommended)",
            status="partial" if count > 0 else "missing",
            source="profile",
            detail="Add more skills on your Profile page, or upload your resume to extract them.",
        ))

    if not profile.experiences:
        items.append(PreflightItem(
            name="Experience",
            description="Your work experience",
            status="missing",
            source="profile",
            detail="Add work experience on your Profile page, or upload your resume.",
        ))

    if not profile.raw_resume_text:
        items.append(PreflightItem(
            name="Resume Text",
            description="Full resume content for AI analysis",
            status="missing",
            source="profile",
            detail="Upload your resume on the Profile page so agents can reference it.",
        ))

    return items


def _job_check(job: JobListing | None) -> list[PreflightItem]:
    """Check job listing completeness."""
    items = []

    if not job:
        items.append(PreflightItem(
            name="Job Listing",
            description="The target job you're applying for",
            status="missing",
            source="job_listing",
            detail="Select or add a job listing first.",
        ))
        return items

    if not job.description:
        items.append(PreflightItem(
            name="Job Description",
            description="The full job description text",
            status="missing",
            source="job_listing",
            detail="The job listing needs a description. Try 'Import from URL' to scrape it.",
        ))

    if not job.requirements:
        items.append(PreflightItem(
            name="Job Requirements",
            description="Extracted job requirements",
            status="missing",
            source="job_listing",
            detail="Import the job listing from its URL to automatically extract requirements.",
        ))

    return items


def _artifact_check(
    artifacts: list[WorkspaceArtifact],
    needed_type: str,
    name: str,
    description: str,
    source_agent: str,
) -> PreflightItem | None:
    """Check if a specific artifact type exists in the workspace."""
    found = any(a.artifact_type == needed_type for a in artifacts)
    if not found:
        return PreflightItem(
            name=name,
            description=description,
            status="missing",
            source="workspace",
            detail=f"Run the {source_agent.replace('_', ' ').title()} agent first to generate this.",
        )
    return None


# ---------- Per-agent preflight definitions ----------

AGENT_REQUIREMENTS = {
    "scout": {
        "description": "Analyzes job listings against your profile to find strong matches",
        "required": ["profile_basic", "job_listing"],
        "optional": [],
        "next_agent": "tailor",
    },
    "tailor": {
        "description": "Customizes your resume to match a specific job listing",
        "required": ["profile_full", "job_listing"],
        "optional": ["job_match_analysis"],
        "next_agent": "coach",
    },
    "coach": {
        "description": "Prepares you for interviews with practice questions and feedback",
        "required": ["profile_basic", "job_listing"],
        "optional": ["job_match_analysis", "skill_gap_report"],
        "next_agent": "talking_points",
    },
    "talking_points": {
        "description": "Creates compelling interview stories for each resume bullet point",
        "required": ["profile_basic", "job_listing"],
        "optional": ["tailored_resume"],
        "next_agent": "strategist",
    },
    "strategist": {
        "description": "Generates cover letters and application strategies",
        "required": ["profile_basic", "job_listing"],
        "optional": ["tailored_resume", "job_match_analysis"],
        "next_agent": "brand_advisor",
    },
    "brand_advisor": {
        "description": "Researches the company and helps you tailor your personal brand",
        "required": ["job_listing"],
        "optional": ["job_match_analysis"],
        "next_agent": "coordinator",
    },
    "coordinator": {
        "description": "Orchestrates the full application process and tracks progress",
        "required": ["job_listing"],
        "optional": ["job_match_analysis", "tailored_resume", "cover_letter", "interview_prep_guide", "company_brief"],
        "next_agent": "auto_fill",
    },
    "auto_fill": {
        "description": "Analyzes application forms and generates an auto-fill script for your browser",
        "required": ["profile_full", "job_listing"],
        "optional": ["tailored_resume", "cover_letter"],
        "next_agent": None,
    },
}


async def run_preflight(
    db: AsyncSession,
    agent_name: str,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> PreflightResult:
    """Run preflight checks for a specific agent and application."""

    reqs = AGENT_REQUIREMENTS.get(agent_name)
    if not reqs:
        return PreflightResult(
            agent_name=agent_name,
            ready=False,
            items=[PreflightItem(
                name="Agent",
                description="Unknown agent",
                status="missing",
                source="user_input",
                detail=f"Agent '{agent_name}' is not recognized.",
            )],
        )

    # Load profile
    profile_result = await db.execute(
        select(Profile).where(Profile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()

    # Load application with job listing
    app_result = await db.execute(
        select(Application).where(
            Application.id == application_id,
            Application.user_id == user_id,
        )
    )
    application = app_result.scalar_one_or_none()
    job = application.job_listing if application else None

    # Load workspace artifacts
    artifacts: list[WorkspaceArtifact] = []
    ws_result = await db.execute(
        select(AgentWorkspace).where(AgentWorkspace.application_id == application_id)
    )
    workspace = ws_result.scalar_one_or_none()
    if workspace:
        art_result = await db.execute(
            select(WorkspaceArtifact).where(WorkspaceArtifact.workspace_id == workspace.id)
        )
        artifacts = list(art_result.scalars().all())

    items: list[PreflightItem] = []

    # Check required items
    for req in reqs["required"]:
        if req == "profile_basic":
            checks = _profile_check(profile)
            # For basic, only headline + skills are truly required
            basic = [c for c in checks if c.name in ("Profile", "Headline", "Skills")]
            items.extend(basic)
        elif req == "profile_full":
            items.extend(_profile_check(profile))
        elif req == "job_listing":
            items.extend(_job_check(job))

    # Check optional workspace artifacts (mark as suggestions, not blockers)
    for opt in reqs["optional"]:
        artifact_item = _artifact_check(
            artifacts,
            needed_type=opt,
            name=opt.replace("_", " ").title(),
            description=f"Analysis from a previous agent",
            source_agent=_artifact_to_agent(opt),
        )
        if artifact_item:
            artifact_item.status = "partial"  # optional items are "partial", not "missing"
            items.append(artifact_item)

    # Determine readiness: ready if no "missing" items
    missing_count = sum(1 for i in items if i.status == "missing")
    ready = missing_count == 0

    # Build suggestion
    suggestion = None
    if not ready:
        missing_names = [i.name for i in items if i.status == "missing"]
        suggestion = (
            f"I can still help, but I'll be more accurate with: {', '.join(missing_names)}. "
            f"Want to continue anyway, or add the missing info first?"
        )
    elif any(i.status == "partial" for i in items):
        suggestion = (
            "I have everything I need! Some optional data from other agents could "
            "improve my analysis. Ready to proceed?"
        )

    return PreflightResult(
        agent_name=agent_name,
        ready=ready,
        items=items,
        suggestion=suggestion,
    )


def _artifact_to_agent(artifact_type: str) -> str:
    """Map artifact type to the agent that produces it."""
    mapping = {
        "job_match_analysis": "scout",
        "skill_gap_report": "scout",
        "tailored_resume": "tailor",
        "keyword_optimization": "tailor",
        "interview_prep_guide": "coach",
        "star_responses": "coach",
        "cover_letter": "strategist",
        "application_strategy": "strategist",
        "company_brief": "brand_advisor",
        "culture_analysis": "brand_advisor",
        "application_checklist": "coordinator",
        "follow_up_plan": "coordinator",
        "interview_stories": "talking_points",
        "story_cheatsheet": "talking_points",
        "form_fill_plan": "auto_fill",
        "form_fill_script": "auto_fill",
        "chatbot_transcript": "auto_fill",
        "application_guide": "auto_fill",
    }
    return mapping.get(artifact_type, "unknown")
