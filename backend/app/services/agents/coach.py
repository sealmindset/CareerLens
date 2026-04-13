"""Coach Agent -- Interview preparation.

Prepares the candidate with targeted interview questions, STAR-method responses,
gap mitigation strategies, and recruiter screen survival tactics.

Produces: interview_prep_guide, star_responses, recruiter_screen_guide
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


async def run_coach_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Coach agent's interview preparation task."""

    # Task 1: Interview Prep Guide
    prep_prompt = """Create a comprehensive interview preparation guide for this specific role.

Include:

1. **Likely Interview Format** -- Based on the company and role level, predict:
   - Number of rounds (phone screen, technical, behavioral, panel, etc.)
   - Who you'll likely talk to (HR, hiring manager, team leads, skip-level)
   - Duration estimates

2. **Top 10 Likely Questions** -- For each:
   - The question
   - Why they're asking it (what they want to learn)
   - Key points to hit in your answer
   - What to AVOID saying

3. **Technical/Domain Questions** -- Based on the job requirements:
   - Specific technical questions they may ask
   - Suggested approach to answering
   - How to handle "I don't know" gracefully

4. **Questions About Gaps** -- Based on the skill gap analysis:
   - How to proactively address gaps
   - Reframing language for each gap
   - Evidence of quick learning ability

5. **Questions YOU Should Ask** -- 5-7 insightful questions that:
   - Show you've researched the company
   - Demonstrate strategic thinking
   - Help you evaluate if this role is right for you

6. **Red Flags to Watch For** -- Signs the role/company might not be a good fit

Format as a study guide the candidate can review before each interview round."""

    prep_response = await call_agent_ai(
        context.db, "coach", prep_prompt, context
    )

    prep_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="coach",
        artifact_type="interview_prep_guide",
        title=f"Interview Prep: {context.job.title} at {context.job.company}",
        content=prep_response,
    )

    # Task 2: STAR Response Bank
    star_prompt = """Create a bank of STAR-method responses using the candidate's ACTUAL experience.

For the top 8 behavioral questions most likely for this role, create ready-to-use STAR responses:

**For each response:**
- **Question:** The behavioral question
- **Situation:** A specific, real scenario from the candidate's experience
- **Task:** What the candidate needed to accomplish
- **Action:** Specific steps the candidate took (use first person)
- **Result:** Measurable outcomes where possible

RULES:
- Only use experiences from the candidate's actual profile/resume
- If the candidate's experience doesn't have a perfect match, use the closest relevant experience
- Quantify results where the data supports it
- Keep each STAR response to 2-3 minutes of speaking time (roughly 200-300 words)
- Vary the experiences drawn from -- don't use the same role for every answer

Focus on questions that test:
- Leadership / influence
- Problem-solving under pressure
- Collaboration / conflict resolution
- Technical decision-making
- Adaptability / learning
- Impact / results orientation

Format as a reference card the candidate can study."""

    star_response = await call_agent_ai(
        context.db, "coach", star_prompt, context
    )

    star_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="coach",
        artifact_type="star_responses",
        title=f"STAR Response Bank: {context.job.title}",
        content=star_response,
    )

    # Task 3: Recruiter Screen Survival Guide
    screen_prompt = """Create a Recruiter Screen Survival Guide for a senior candidate applying to this role.

Senior candidates face a unique set of gatekeeper questions designed to screen them OUT.
This guide arms the candidate with ready-to-use scripts for every one of them.

Cover ALL 8 sections:

1. **"Aren't you overqualified for this role?"**
   - 3 distinct deflection scripts (casual, confident, strategic)
   - Core message: "I'm not overqualified -- I'm precisely qualified AND I bring extras"
   - Each script should be 2-3 sentences, natural, conversational

2. **Salary Expectations**
   - Bracket strategy: how to name a range without anchoring too low or scaring them off
   - Deflection script for "What are you making now?" (illegal in many states, always deflectable)
   - How to pivot to "What's the budgeted range for this role?"
   - Script for when the range is below expectations: graceful exploration, not rejection

3. **"Why this role? It seems like a step down."**
   - Intentional-move narrative: frame as deliberate specialization, not desperation
   - Reference specific things about THIS company/role that make it compelling
   - Script: 3-4 sentences explaining the intentional career move

4. **"How long do you plan to stay?"**
   - Longevity assurance script (never say "forever" -- that's a lie they'll see through)
   - Frame around the impact timeline: "I see 2-3 years of meaningful work here because..."
   - Address the "flight risk" concern head-on without being defensive

5. **"We were looking for someone more junior..."**
   - Value-per-dollar redirect: "You get senior output at [level] investment"
   - Script emphasizing ramp time savings, mentorship value, and execution speed
   - Counter-intuitive pitch: "A senior person in a mid role overdelivers from day one"

6. **"Tell me about yourself" (90-Second Pitch)**
   - A complete, ready-to-deliver 90-second pitch tailored to THIS role
   - Structure: Current state (1 sentence) -> Most relevant expertise (2 sentences) -> Why THIS role (1 sentence) -> Forward-looking close (1 sentence)
   - Must avoid overqualification flags while still conveying deep expertise
   - Should sound natural, not rehearsed

7. **Red Flags to Listen For**
   - Signals the company will never pay fairly for this role
   - Warning signs the hiring manager doesn't actually want a senior person
   - Language that reveals they're looking for cheap labor, not talent
   - When to disengage gracefully and save your energy for better opportunities

8. **Questions to Ask the Recruiter**
   - 5 questions that demonstrate right-level engagement (not too senior, not too junior)
   - Questions that subtly probe whether the company values experience
   - At least 1 question about team dynamics and 1 about growth path

RULES:
- Every script must be specific to THIS job and company -- no generic filler
- Tone: confident, calm, strategic -- never defensive or apologetic
- Each script should be copy-paste ready for a real phone screen
- Reference the candidate's actual experience where relevant
- Format as a practical study guide with clear headers and ready-to-use scripts"""

    screen_response = await call_agent_ai(
        context.db, "coach", screen_prompt, context
    )

    screen_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="coach",
        artifact_type="recruiter_screen_guide",
        title=f"Recruiter Screen Guide: {context.job.title} at {context.job.company}",
        content=screen_response,
    )

    return [prep_artifact, star_artifact, screen_artifact]
