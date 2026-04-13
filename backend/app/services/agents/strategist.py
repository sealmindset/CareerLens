"""Strategist Agent -- Cover letter and application strategy.

Generates customized cover letters and develops application strategies
including follow-up plans, negotiation preparation, and posting-age
urgency analysis.

Produces: cover_letter, application_strategy
"""

import logging
from datetime import datetime, timezone

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

    # Task 2: Application Strategy — with posting-age urgency analysis
    days_since_posted = None
    if context.job.created_at:
        now = datetime.now(timezone.utc)
        created = context.job.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        days_since_posted = (now - created).days

    timing_context = ""
    if days_since_posted is not None:
        if days_since_posted < 3:
            urgency = "FRESH (<3 days) — Strike now. You are in the first wave of applicants."
        elif days_since_posted < 7:
            urgency = "ACTIVE (3-7 days) — Competitive window. Apply this week to stay in the early pool."
        elif days_since_posted < 14:
            urgency = "AGING (1-2 weeks) — Screening has likely started. Prioritize speed over perfection."
        else:
            urgency = "STALE (2+ weeks) — Late entry. Direct outreach to the hiring manager is critical."
        timing_context = (
            f"\n\n## POSTING AGE INTELLIGENCE\n"
            f"This job was added to CareerLens {days_since_posted} day(s) ago.\n"
            f"Urgency tier: {urgency}\n"
            f"Factor this into every timing recommendation below. If the posting is aging or stale, "
            f"emphasise speed, direct outreach, and hiring-manager contact as the primary strategy."
        )

    strategy_prompt = f"""Develop a comprehensive application strategy for this role.
{timing_context}
Include:

1. **Posting Age & Urgency**
   - How old this posting appears to be and what that means for the candidate
   - Whether the application window is still competitive
   - Urgency-adjusted recommendation (apply now vs. prioritise outreach first)

2. **Application Timing**
   - Best time to submit (day of week, time of day)
   - Whether to apply directly or through a referral
   - Whether to reach out to the hiring manager first

3. **Application Channels**
   - Primary: where to submit the formal application
   - Secondary: LinkedIn connections at the company
   - Networking: relevant people to connect with

4. **Follow-Up Plan**
   - Day 1: What to do right after submitting
   - Week 1: First follow-up strategy
   - Week 2+: Escalation strategy
   - Email templates for each follow-up

5. **Salary Negotiation Prep**
   - Estimated salary range for this role + location + experience level
   - The candidate's leverage points
   - Opening position and walk-away number considerations
   - Non-salary benefits to negotiate

6. **Competing Offers Strategy**
   - How to create urgency without burning bridges
   - How to evaluate this offer against others

7. **Risk Assessment**
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
