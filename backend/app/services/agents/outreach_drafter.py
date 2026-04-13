"""Direct Outreach Drafter -- Bypass-the-ATS messaging.

Produces two ready-to-send messages:
1. LinkedIn message (under 300 characters)
2. Email to the hiring manager (3-4 sentences)

Both reference the 90-day plan as a differentiator and cite specific
company details from the Brand Advisor's company_brief.

Produces: outreach_message
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


def _get_ninety_day_plan(context: AgentContext) -> str:
    """Pull ninety_day_plan from workspace artifacts if available."""
    for art in context.workspace_artifacts:
        if art.artifact_type == "ninety_day_plan":
            return art.content
    return ""


def _get_tailored_resume(context: AgentContext) -> str:
    """Pull the best available resume from workspace artifacts."""
    for art_type in ("amplified_resume", "right_sized_resume", "ageism_scrubbed_resume", "tailored_resume"):
        for art in context.workspace_artifacts:
            if art.artifact_type == art_type:
                return art.content
    return ""


async def run_outreach_drafter_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Draft direct outreach messages for the hiring manager."""

    company_brief = _get_company_brief(context)
    ninety_day_plan = _get_ninety_day_plan(context)
    resume = _get_tailored_resume(context)

    extra_context_parts: list[str] = []
    if company_brief:
        extra_context_parts.append(
            f"## Company Research Brief\n{company_brief[:2000]}"
        )
    if ninety_day_plan:
        extra_context_parts.append(
            f"## Candidate's 90-Day Plan\n{ninety_day_plan[:2000]}"
        )
    if resume:
        extra_context_parts.append(
            f"## Candidate's Resume (summary)\n{resume[:1500]}"
        )

    extra_context = "\n\n".join(extra_context_parts)

    outreach_prompt = f"""Draft two direct outreach messages for the hiring manager of this role.

{extra_context}

## PURPOSE
Most candidates apply through the ATS and wait. This candidate also reaches out
directly to the hiring manager -- a confident peer-to-peer gesture that signals
initiative, research, and genuine interest.

## MESSAGE 1: LINKEDIN MESSAGE
- STRICT limit: under 300 characters (LinkedIn connection request limit)
- Structure: Hook (something specific about the company) + connection to the role +
  mention that you've prepared a 90-day plan + clear CTA
- Tone: confident professional peer, NOT a desperate applicant
- No "I know you're busy" or apologetic language
- No generic flattery -- reference something SPECIFIC about the company

## MESSAGE 2: EMAIL TO HIRING MANAGER
- Length: 3-4 sentences max (busy people don't read long emails)
- Subject line included (compelling, not clickbait)
- Structure:
  1. Specific hook about the company (from company brief)
  2. One sentence connecting your strongest qualification to their biggest need
  3. Mention you've submitted your application AND prepared a 90-day plan
  4. Clear, low-friction CTA ("Happy to share the plan if helpful")
- Tone: same confident peer energy as LinkedIn message
- Sign off professionally

## RULES
- NEVER grovel, beg, or use desperate language
- NEVER use "I know you're busy" or "Sorry to bother you"
- Reference something SPECIFIC about the company (not generic)
- Mention the 90-day plan as a differentiator (if available)
- Keep both messages ready to send -- no placeholders or [fill in] markers
- The candidate should be able to copy-paste these directly
- Format as clean markdown with clear headers for each message"""

    outreach_response = await call_agent_ai(
        context.db, "outreach_drafter", outreach_prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="outreach_drafter",
        artifact_type="outreach_message",
        title=f"Direct Outreach: {context.job.title} at {context.job.company}",
        content=outreach_response,
    )

    return [artifact]
