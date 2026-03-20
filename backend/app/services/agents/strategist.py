"""Strategist Agent -- Cover letter and application strategy.

Generates customized cover letters and develops application strategies
including follow-up plans and negotiation preparation.

Produces: cover_letter, application_strategy
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


async def run_strategist_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Strategist agent's cover letter and strategy task."""

    # Task 1: Cover Letter
    cover_prompt = """Write a compelling, personalized cover letter for this application.

RULES:
- Write in the candidate's authentic voice (match the tone of their resume/summary)
- Never fabricate achievements or experience
- Be specific -- reference the company by name, the role, and specific requirements
- Show genuine enthusiasm without being generic or sycophantic
- Keep it to one page (350-450 words)

STRUCTURE:
1. **Opening** -- Hook that connects the candidate to this specific role (not "I'm excited to apply...")
2. **Value Proposition** -- 2-3 paragraphs demonstrating fit:
   - Lead with strongest match to their top requirement
   - Address a requirement where the candidate's experience adds unique value
   - Show cultural fit or alignment with company mission
3. **Closing** -- Confident close with clear call to action

Include specific examples from the candidate's experience that demonstrate they can
deliver on the role's key responsibilities.

Format as a clean, professional cover letter (not markdown headers -- use letter format)."""

    cover_response = await call_agent_ai(
        context.db, "strategist", cover_prompt, context
    )

    cover_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="strategist",
        artifact_type="cover_letter",
        title=f"Cover Letter: {context.job.title} at {context.job.company}",
        content=cover_response,
    )

    # Task 2: Application Strategy
    strategy_prompt = """Develop a comprehensive application strategy for this role.

Include:

1. **Application Timing**
   - Best time to submit (day of week, time of day)
   - Whether to apply directly or through a referral
   - Whether to reach out to the hiring manager first

2. **Application Channels**
   - Primary: where to submit the formal application
   - Secondary: LinkedIn connections at the company
   - Networking: relevant people to connect with

3. **Follow-Up Plan**
   - Day 1: What to do right after submitting
   - Week 1: First follow-up strategy
   - Week 2+: Escalation strategy
   - Email templates for each follow-up

4. **Salary Negotiation Prep**
   - Estimated salary range for this role + location + experience level
   - The candidate's leverage points
   - Opening position and walk-away number considerations
   - Non-salary benefits to negotiate

5. **Competing Offers Strategy**
   - How to create urgency without burning bridges
   - How to evaluate this offer against others

6. **Risk Assessment**
   - Potential objections the employer might have
   - Preemptive responses for each objection

Format as an actionable strategy document with clear next steps and timelines."""

    strategy_response = await call_agent_ai(
        context.db, "strategist", strategy_prompt, context
    )

    strategy_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="strategist",
        artifact_type="application_strategy",
        title=f"Application Strategy: {context.job.title} at {context.job.company}",
        content=strategy_response,
    )

    return [cover_artifact, strategy_artifact]
