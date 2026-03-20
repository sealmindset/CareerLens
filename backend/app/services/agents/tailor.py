"""Tailor Agent -- Resume customization.

Rewrites the candidate's resume to authentically match a specific job listing.
Never fabricates experience -- reframes existing experience to highlight relevance.

Produces: tailored_resume, keyword_optimization
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


async def run_tailor_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Tailor agent's resume customization task."""

    # Task 1: Tailored Resume
    resume_prompt = """Rewrite the candidate's resume specifically tailored for this job listing.

RULES:
- NEVER fabricate experience, skills, or achievements
- Reframe existing experience to highlight relevance to this specific role
- Use keywords and phrases from the job description naturally
- Quantify achievements where the data exists (don't invent numbers)
- Optimize for ATS (Applicant Tracking Systems) by including exact keyword matches
- Maintain the candidate's authentic voice

STRUCTURE the tailored resume as:
1. **Professional Summary** -- 3-4 sentences tailored to this role
2. **Key Skills** -- organized by relevance to the job requirements
3. **Professional Experience** -- each role reframed for relevance, most recent first
4. **Education** -- highlight relevant coursework or achievements
5. **Additional** -- certifications, projects, or other relevant items

For each experience entry, include:
- The original title and company (unchanged)
- Rewritten bullet points that emphasize relevance to the target role
- A brief note on WHY this experience matters for the target role

Format as clean markdown ready to be converted to a document."""

    resume_response = await call_agent_ai(
        context.db, "tailor", resume_prompt, context
    )

    resume_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="tailored_resume",
        title=f"Tailored Resume: {context.job.title} at {context.job.company}",
        content=resume_response,
    )

    # Task 2: Keyword Optimization Guide
    keyword_prompt = """Create a keyword optimization guide for this application.

Analyze the job description and produce:

1. **Must-Include Keywords** -- terms that MUST appear in the resume/cover letter
   - The exact keyword or phrase
   - Where it appears in the job description
   - How the candidate's profile maps to it
   - Suggested placement (summary, skills, experience bullet)

2. **ATS Tips** -- specific formatting and keyword tips for this company's likely ATS
   - File format recommendations
   - Section heading conventions
   - Skills section formatting

3. **Language Matching** -- phrases from the job description to echo:
   - Job description says → Resume should say
   - (Map the company's language to the candidate's experience)

4. **Red Flags to Avoid** -- things that might trigger ATS rejection or recruiter skip

Format as a practical checklist the candidate can use while reviewing their resume."""

    keyword_response = await call_agent_ai(
        context.db, "tailor", keyword_prompt, context
    )

    keyword_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="tailor",
        artifact_type="keyword_optimization",
        title=f"Keyword Optimization: {context.job.title}",
        content=keyword_response,
    )

    return [resume_artifact, keyword_artifact]
