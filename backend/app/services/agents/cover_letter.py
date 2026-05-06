"""Cover Letter Agent -- Problem-first, future-focused cover letters.

Reads the JD to identify what problem the company is solving by hiring.
Produces 2-3 cover letter variations each targeting a different inferred
problem, plus one recommended polished draft.

Produces: cover_letter
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


async def run_cover_letter_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Cover Letter agent."""

    prompt = """You are writing cover letters for a job candidate. Your output will contain
ALL of the following sections in ONE response.

## PHASE 1 -- PROBLEM IDENTIFICATION

Read the job description carefully. Companies hire because they have a problem --
a gap, a scaling challenge, a transition, a compliance pressure, a team dysfunction,
a market shift. Identify 2-3 DISTINCT underlying problems this role is meant to solve.

For each, write:
- **Problem [N]: [short title]** -- a 1-2 sentence diagnosis of what's really going on.

## PHASE 2 -- COVER LETTER VARIATIONS

For each problem identified above, write a COMPLETE cover letter (250-350 words).

### What each letter MUST do:

1. **Open by naming the problem.** Not "I'm excited to apply." Show you understand
   what pain this hire is meant to relieve. The hiring manager should think: "this
   person gets it before they've walked in the door."

2. **Connect the candidate to the problem through narrative.** Draw on the Story Bank
   entries and tailored resume to show -- don't list -- how this candidate's shape of
   experience maps to the problem. Use phrases like "The last time I saw this pattern
   was when..." or "What teams typically miss in this situation is..." to demonstrate
   judgment and perspective the resume can't convey.

3. **Position the candidate as the future, not the past.** The resume covers history.
   The cover letter says: here's why I already fit this team. Express adaptability,
   learning velocity, and enthusiasm. Show the reader the candidate is the missing
   piece -- not by speculating about 30/60/90 days, but by making the case that this
   is exactly the kind of problem they've spent a career learning to solve.

4. **Close with a confident, specific invitation** to continue the conversation. Not a
   recap. Not "I look forward to hearing from you." Something that shows conviction.

### Rules for EVERY variation:

- Letter format: salutation, paragraphs, sign-off. NO bulleted lists. NO markdown headers.
- 250-350 words
- NEVER rehash the resume -- if a resume fact is essential, reference it in a single
  clause ("after a decade running security programs...") and move on
- NEVER fabricate experience, metrics, or company details
- Match the candidate's authentic voice
- Genuine, confident, enthusiastic -- NEVER desperate or sycophantic
- Reference the company and role by name

Label each: **--- Variation [N]: [Problem Title] ---**

## PHASE 3 -- RECOMMENDED DRAFT

Choose the strongest variation and produce a final polished version.

Before the letter, include:
- **Why this angle:** 2-3 sentences explaining why this problem framing is the strongest
  approach for this specific role and company.
- **What I refined:** Brief note on any improvements over the variation above.

Then the polished letter, labeled: **--- Recommended Draft ---**"""

    response = await call_agent_ai(
        context.db, "cover_letter", prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="cover_letter",
        artifact_type="cover_letter",
        title=f"Cover Letter: {context.job.title} at {context.job.company}",
        content=response,
    )

    return [artifact]
