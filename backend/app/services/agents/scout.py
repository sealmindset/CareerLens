"""Scout Agent -- Job matching and analysis.

Analyzes job listings against the user's profile to identify match strength,
skill gaps, and strategic positioning recommendations.

Produces: job_match_analysis, skill_gap_report
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


async def run_scout_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Scout agent's primary analysis task."""

    # Task 1: Job Match Analysis
    match_prompt = """Analyze this job listing against the candidate's profile and produce a detailed match analysis.

Include:
1. **Overall Match Score** (0-100) with justification
2. **Strengths** -- skills and experience that directly match requirements
3. **Gaps** -- requirements the candidate doesn't clearly meet
4. **Hidden Strengths** -- transferable skills or experience that could apply but aren't obvious
5. **Positioning Strategy** -- how to frame the application to maximize match perception
6. **Key Keywords** -- important terms from the job description to echo in resume/cover letter

Format as a structured markdown document. Be specific -- reference actual skills, job titles, and requirements by name."""

    match_response = await call_agent_ai(
        context.db, "scout", match_prompt, context
    )

    match_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="scout",
        artifact_type="job_match_analysis",
        title=f"Match Analysis: {context.job.title} at {context.job.company}",
        content=match_response,
    )

    # Task 2: Skill Gap Report
    gap_prompt = """Based on your match analysis, produce a focused skill gap report.

For each gap identified:
1. **Gap Description** -- what's missing
2. **Severity** -- Critical (dealbreaker), Important (strengthens candidacy), or Nice-to-Have
3. **Mitigation Strategy** -- how to address this gap:
   - Can existing experience be reframed?
   - Is there adjacent/transferable experience?
   - Can it be acknowledged with a learning plan?
4. **Talking Points** -- what to say in an interview about this gap

End with a summary of the candidate's overall readiness and recommended action.

Format as structured markdown."""

    gap_response = await call_agent_ai(
        context.db, "scout", gap_prompt, context
    )

    gap_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="scout",
        artifact_type="skill_gap_report",
        title=f"Skill Gap Report: {context.job.title}",
        content=gap_response,
    )

    return [match_artifact, gap_artifact]
