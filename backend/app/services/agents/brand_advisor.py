"""Brand Advisor Agent -- Company research and personal brand alignment.

Researches the target company and helps the candidate align their
personal brand and messaging to the company's culture and values.

Produces: company_brief, culture_analysis
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


async def run_brand_advisor_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Brand Advisor agent's company research and brand alignment task."""

    # Task 1: Company Brief
    brief_prompt = """Create a comprehensive company research brief for the candidate.

Based on the company name, job listing, and any available information:

1. **Company Overview**
   - What they do, industry, size, and stage
   - Recent news, funding rounds, or major initiatives
   - Key products/services relevant to this role

2. **Mission & Values**
   - Stated mission and core values
   - How these values show up in the job description
   - Cultural themes to echo in your application

3. **Leadership & Team**
   - Key leaders to research on LinkedIn
   - The team this role likely sits on
   - Organizational structure insights

4. **Competitive Landscape**
   - Main competitors
   - The company's differentiation
   - Industry trends affecting this role

5. **Employee Experience**
   - Known reputation (Glassdoor themes, if inferable)
   - Work-life balance signals from the job posting
   - Growth and development opportunities

6. **Talking Points**
   - 5 specific things to mention in your cover letter or interview
   - Company-specific knowledge that shows you've done your homework
   - Questions that demonstrate genuine interest

NOTE: Base your analysis on the job listing details and general knowledge.
Be transparent about what is inferred vs. confirmed from the listing.

Format as a research brief the candidate can review before writing their application."""

    brief_response = await call_agent_ai(
        context.db, "brand_advisor", brief_prompt, context
    )

    brief_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="brand_advisor",
        artifact_type="company_brief",
        title=f"Company Brief: {context.job.company}",
        content=brief_response,
    )

    # Task 2: Culture Analysis & Brand Alignment
    culture_prompt = """Analyze the company culture signals and create a personal brand alignment guide.

1. **Culture Signals from Job Description**
   - Language analysis: What do their word choices reveal about culture?
   - Values emphasis: Which values do they mention most?
   - Team dynamics: What can you infer about how teams work there?
   - Innovation vs. stability: Where do they fall on this spectrum?

2. **Personal Brand Alignment**
   Based on the candidate's profile and this company's culture:
   - **Amplify:** Aspects of the candidate's brand that align perfectly
   - **Adapt:** Areas where the candidate can shift emphasis
   - **Authentic Hooks:** Genuine connections between the candidate and company values

3. **Communication Style Guide**
   - Tone to use in application materials (formal/casual/technical)
   - Vocabulary to use and avoid
   - Storytelling angle that resonates with this company

4. **LinkedIn Optimization** (for this application)
   - Headline suggestions that would catch this company's attention
   - Profile sections to update before applying
   - Content or activity that would strengthen the application

5. **Interview Persona**
   - How to present yourself in alignment with company culture
   - Dress code and presentation signals
   - Energy level and communication style to match

Format as an actionable brand guide the candidate can reference throughout the application process."""

    culture_response = await call_agent_ai(
        context.db, "brand_advisor", culture_prompt, context
    )

    culture_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="brand_advisor",
        artifact_type="culture_analysis",
        title=f"Culture & Brand Alignment: {context.job.company}",
        content=culture_response,
    )

    return [brief_artifact, culture_artifact]
