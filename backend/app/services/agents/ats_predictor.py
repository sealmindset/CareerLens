"""ATS Score Predictor Agent -- Applicant Tracking System simulation.

Simulates how an ATS would parse and score the resume against the job
description. Performs exact keyword matching, section heading analysis,
format compatibility checking, and produces a predicted score with
specific actionable fixes.

Produces: ats_score
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


def _get_best_resume_content(context: AgentContext) -> str:
    """Get the best available resume: amplified > ageism_scrubbed > tailored."""
    for artifact_type in ("amplified_resume", "ageism_scrubbed_resume", "tailored_resume"):
        for artifact in context.workspace_artifacts:
            if artifact.artifact_type == artifact_type:
                return artifact.content
    return ""


async def run_ats_predictor_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the ATS Score Predictor agent."""

    resume_content = _get_best_resume_content(context)

    job_requirements_text = ""
    if context.job.requirements:
        job_requirements_text = "\n".join(
            f"- [{req.requirement_type}] {req.requirement_text}"
            for req in context.job.requirements
        )

    ats_prompt = f"""You are an ATS (Applicant Tracking System) simulator. Analyze this resume
against this specific job description as if you were the ATS software deciding whether
to pass this candidate to a human recruiter.

## Resume Under Review

{resume_content}

## Extracted Requirements

{job_requirements_text}

## YOUR ANALYSIS

Perform ALL of the following analyses and produce a structured report:

### 1. KEYWORD MATCH ANALYSIS

Extract every significant keyword and phrase from the job description, then check
if each one appears in the resume. Be EXACT -- partial matches count as partial.

Format as a table:

| Keyword/Phrase | Found in Resume? | Location | Match Type |
|---|---|---|---|
| [keyword] | Yes/No/Partial | [section] | Exact/Partial/Missing |

### 2. PREDICTED ATS SCORE

Based on keyword density, match rate, and formatting compliance, predict a score:

**Score: [XX]/100**

Scoring breakdown:
- Hard skill keyword matches (40%): [X/40]
- Soft skill/culture keywords (15%): [X/15]
- Job title alignment (15%): [X/15]
- Section heading compatibility (10%): [X/10]
- Education/certification matches (10%): [X/10]
- Format and parsing safety (10%): [X/10]

### 3. SECTION HEADING COMPATIBILITY

ATS systems expect standard section headings. Check each heading in the resume:

| Resume Heading | ATS Compatible? | Recommended Alternative |
|---|---|---|
| [heading] | Yes/Risk | [alternative if needed] |

Standard ATS headings: Professional Summary, Experience, Education, Skills,
Certifications, Projects, Volunteer

### 4. FORMATTING WARNINGS

Flag anything that could cause ATS parsing failures:
- Tables or columns (many ATS systems can't parse these)
- Headers/footers (often ignored by ATS)
- Images, logos, or graphics references
- Non-standard bullet characters
- Unusual date formats
- Missing contact information section

### 5. CRITICAL MISSING KEYWORDS

List the TOP 10 keywords from the job description that are COMPLETELY ABSENT
from the resume, ranked by importance to this role:

1. **[keyword]** -- Why it matters: [explanation]. Suggested fix: [where and how to add it]
2. ...

### 6. QUICK WINS

List 5 specific, concrete changes that would most improve the ATS score:

1. [Change] -- Expected score improvement: +[X] points
2. ...

## RULES

- Be PRECISE and ANALYTICAL -- this is a scoring exercise, not creative writing
- Base keyword extraction on the ACTUAL job description text, not assumptions
- Count exact matches only as "Exact" -- substring or synonym matches are "Partial"
- The score must be defensible -- show your math
- Format the entire output as clean markdown"""

    response = await call_agent_ai(
        context.db, "ats_predictor", ats_prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="ats_predictor",
        artifact_type="ats_score",
        title=f"ATS Score Analysis: {context.job.title} at {context.job.company}",
        content=response,
    )

    return [artifact]
