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
    cover_prompt = """Write a compelling, personalized cover letter that STANDS ON ITS OWN
alongside the resume. The resume lists the facts. The cover letter does something different:
it reads the room, names the problem, and paints a picture of the candidate solving it
inside this team.

## CORE DIRECTIVE — DO NOT REPEAT THE RESUME

Assume the reader already has the resume in their other hand. NEVER restate:
- Job titles, company names, dates, degrees, or certifications
- Bullet-point accomplishments or metrics that already appear in the resume
- Skill lists or technology inventories

If a resume fact is essential to the argument, REFERENCE it in a single clause ("after a
decade running security programs in regulated industries...") and move on — never
re-describe it. The cover letter is a lens, not a summary.

## WHAT TO WRITE INSTEAD

1. **Name the problem the JD is really solving.**
   Read between the lines of the job description. What pain is the hiring team trying to
   make go away? What shift, transition, scale, regulatory pressure, or team dysfunction
   is this role secretly about? Lead with a crisp articulation of that underlying problem —
   the one every bullet point in the JD is orbiting. This shows you understand the work
   before you've walked in the door.

2. **Connect the candidate to that problem.**
   Show — don't list — how this candidate's shape of experience maps to the problem.
   Use narrative: "The last time I saw this pattern was when..." or "What a team typically
   misses in this situation is...". Draw on judgment, instinct, and perspective developed
   over the career — things a resume cannot convey.

3. **Position the candidate as the missing piece.**
   Show how this candidate's specific shape of experience and expertise is what closes the
   gap between where the team is and where the JD says they need to go. Not a list of
   qualifications — a case that the problem in section 1 is exactly the kind of problem
   this person has spent a career learning to solve. The reader should close the letter
   thinking "this is the piece we've been missing."

   Do NOT speculate about the first 30/60/90 days, conversations they'd start, or dynamics
   they'd change. The letter is about why this candidate fits the problem, not a roadmap
   for what they'd do in the seat.

## RULES

- Write in the candidate's authentic voice — match the cadence of their resume summary
- Never fabricate experience, metrics, or specifics about the company
- Reference the company and role by name, but avoid the "I'm excited to apply" opener
- No bulleted lists inside the letter body — this is prose
- No markdown headers — use letter format (salutation, paragraphs, sign-off)
- One page, 350-450 words
- Genuine, not sycophantic. Confident, not boastful.
- The final paragraph is a confident, specific invitation to continue the conversation —
  not a recap of what was just said"""

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
