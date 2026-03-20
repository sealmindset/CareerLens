"""Coach Agent -- Interview preparation.

Prepares the candidate with targeted interview questions, STAR-method responses,
and gap mitigation strategies specific to the target role.

Produces: interview_prep_guide, star_responses
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

    return [prep_artifact, star_artifact]
