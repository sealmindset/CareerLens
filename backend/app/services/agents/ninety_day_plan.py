"""90-Day Plan Generator -- Concrete onboarding plan that differentiates the candidate.

Produces a one-page, time-boxed action plan the candidate can attach to their
application or reference in outreach.  Uses company brief, culture analysis,
skill gap report, and job requirements for specificity.

Produces: ninety_day_plan
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


def _get_company_brief(context: AgentContext) -> str:
    """Pull company_brief from workspace artifacts if available."""
    for art in context.workspace_artifacts:
        if art.artifact_type == "company_brief":
            return art.content
    return ""


def _get_culture_analysis(context: AgentContext) -> str:
    """Pull culture_analysis from workspace artifacts if available."""
    for art in context.workspace_artifacts:
        if art.artifact_type == "culture_analysis":
            return art.content
    return ""


def _get_skill_gap_report(context: AgentContext) -> str:
    """Pull skill_gap_report from workspace artifacts if available."""
    for art in context.workspace_artifacts:
        if art.artifact_type == "skill_gap_report":
            return art.content
    return ""


async def run_ninety_day_plan_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Generate a 90-day onboarding plan for the target role."""

    company_brief = _get_company_brief(context)
    culture_analysis = _get_culture_analysis(context)
    skill_gap = _get_skill_gap_report(context)

    extra_context_parts: list[str] = []
    if company_brief:
        extra_context_parts.append(
            f"## Company Research Brief\n{company_brief[:3000]}"
        )
    if culture_analysis:
        extra_context_parts.append(
            f"## Culture Analysis\n{culture_analysis[:2000]}"
        )
    if skill_gap:
        extra_context_parts.append(
            f"## Skill Gap Report\n{skill_gap[:2000]}"
        )

    extra_context = "\n\n".join(extra_context_parts)

    plan_prompt = f"""Create a compelling 90-Day Plan for this role that the candidate can
attach to their application or reference in outreach to the hiring manager.

{extra_context}

## PURPOSE
This plan is a DIFFERENTIATOR. Most candidates submit a resume and cover letter.
This candidate arrives with a concrete plan showing they've already thought about
how they'll create value. That's impossible to ignore.

## STRUCTURE

### Week 1-2: Learn & Assess
- Meet key stakeholders and understand the team's current priorities
- Map existing systems, tools, and processes relevant to the role
- Identify 2-3 quick wins based on the candidate's existing strengths
- Tie actions to SPECIFIC company needs (use company brief if available)

### Week 3-6: Quick Wins
- Deliver 2-3 visible improvements using skills the candidate already has
- Each win should solve a real problem the team likely faces (infer from the job description)
- Show cross-functional collaboration (horizontal T-shape value)
- Include measurable targets where possible

### Week 7-12: Strategic Impact
- Launch one larger initiative that demonstrates the candidate's unique value
- Connect the initiative to the company's stated mission or strategic goals
- Propose how to measure success
- Position for long-term growth within the organization

## RULES
- Be SPECIFIC to this company and role -- generic plans are worthless
- Reference the candidate's actual skills and experience (from their profile)
- Each action item should cite which skill or experience qualifies the candidate
- Keep it to ONE PAGE -- concise, scannable, submission-ready
- Use professional formatting with clear section headers
- No commentary or rationale outside the plan itself -- this is a deliverable
- Format as clean markdown"""

    plan_response = await call_agent_ai(
        context.db, "ninety_day_plan", plan_prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="ninety_day_plan",
        artifact_type="ninety_day_plan",
        title=f"90-Day Plan: {context.job.title} at {context.job.company}",
        content=plan_response,
    )

    return [artifact]
