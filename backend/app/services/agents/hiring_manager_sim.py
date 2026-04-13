"""Hiring Manager Simulator Agent -- Resume evaluation from the hiring manager's perspective.

Reads the finished resume AS IF the reader were the hiring manager for the specific role.
Uses the job description to understand what the hiring manager actually cares about,
then produces honest, structured feedback.

Produces: hiring_manager_review
"""

import logging

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


def _get_best_resume_content(context: AgentContext) -> str:
    """Get the best available resume: amplified > right_sized > ageism_scrubbed > tailored."""
    for artifact_type in ("amplified_resume", "right_sized_resume", "ageism_scrubbed_resume", "tailored_resume"):
        for artifact in context.workspace_artifacts:
            if artifact.artifact_type == artifact_type:
                return artifact.content
    return ""


def _get_ats_score_content(context: AgentContext) -> str:
    """Get the ATS score artifact if available."""
    for artifact in context.workspace_artifacts:
        if artifact.artifact_type == "ats_score":
            return artifact.content
    return ""


async def run_hiring_manager_sim_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Hiring Manager Simulator agent."""

    resume_content = _get_best_resume_content(context)
    ats_context = _get_ats_score_content(context)

    ats_reference = ""
    if ats_context:
        ats_reference = f"""

## ATS Results (for your reference)
The ATS system has already scored this resume. You may factor this into your review:

{ats_context[:2000]}
"""

    hm_prompt = f"""You are now the HIRING MANAGER for this specific role. You are not an AI assistant --
you are a busy, experienced manager who has 200 resumes on your desk and needs to decide
which 10 people to phone screen.

## YOUR ROLE CONTEXT

You are hiring for: **{context.job.title}** at **{context.job.company}**

What you ACTUALLY care about (read between the lines of the JD):
- Can this person do the job on Day 1, or will I need to train them?
- Will they fit my team and my organization's working style?
- Are they going to leave in 6 months for something better?
- Do they bring something my current team is missing?
- Is the signal-to-noise ratio in this resume high enough for me to see it in 7 seconds?

## THE RESUME

{resume_content}
{ats_reference}

## YOUR REVIEW

Produce a structured hiring manager review covering ALL of the following:

### 1. THE 7-SECOND SCAN

You glance at this resume for 7 seconds (that's the real average). What do you see?
- **First impression:** [One sentence -- gut reaction]
- **Eyes went to:** [What caught your attention first]
- **Professional level read:** [Junior / Mid / Senior / Staff / Principal / Director / VP]
- **Initial bucket:** [Yes pile / Maybe pile / No pile] -- and why

### 2. WOULD I CALL THIS PERSON?

**Verdict: [YES / LEAN YES / MAYBE / LEAN NO / NO]**

[2-3 sentences explaining your decision as the hiring manager. Be honest and specific.]

### 3. STRENGTHS (What Makes Them Stand Out)

List 3-5 specific strengths that would make you want to interview this person:
- **[Strength]:** [Why this matters for YOUR role specifically]

### 4. CONCERNS (Red Flags or Questions)

List 2-4 concerns or gaps you'd want addressed:
- **[Concern]:** [Why this worries you and what you'd need to hear to be satisfied]

### 5. INTERVIEW QUESTIONS I'D ASK

Based on this resume, list 5 questions you'd ask in the phone screen:
1. **[Question]** -- What I'm really testing: [underlying concern]
2. ...

### 6. CANDIDATE RANKING

How does this candidate compare to the typical applicant pool for this role?

**Estimated percentile: Top [X]% of applicants**

- vs. Underqualified candidates: [comparison]
- vs. Qualified-but-generic candidates: [comparison]
- vs. Strong candidates: [comparison]
- What would make them a TOP 5% candidate: [specific suggestion]

### 7. SPECIFIC IMPROVEMENTS

If I were coaching this candidate, here's exactly what I'd change:

1. **[Change]** -- Why: [hiring manager reasoning]. How: [specific instruction]
2. ...
(List 3-5 changes, ranked by impact)

### 8. OVERALL ASSESSMENT

[A 2-3 paragraph honest assessment written as the hiring manager. Include what
excites you about this candidate, what gives you pause, and what the candidate
could do to move from "maybe" to "definitely yes".]

## PERSONA RULES

- You are TIRED. You have 200 resumes. Your bar is high.
- You are BUSY. You don't read every word. You skim for signal.
- You are PRACTICAL. You care about what this person can DO, not their life story.
- You are SPECIFIC. Generic advice is useless. Every comment references this exact role.
- You are HONEST. Flattery doesn't help the candidate. Tell them the truth.
- You know what the JOB ACTUALLY NEEDS (not just what the JD says).
- Channel the voice of a real hiring manager -- direct, experienced, and decisive.

Format the entire output as clean markdown."""

    response = await call_agent_ai(
        context.db, "hiring_manager_sim", hm_prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="hiring_manager_sim",
        artifact_type="hiring_manager_review",
        title=f"Hiring Manager Review: {context.job.title} at {context.job.company}",
        content=response,
    )

    return [artifact]
