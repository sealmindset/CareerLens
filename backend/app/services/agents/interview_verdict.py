"""Interview Verdict -- Synthesized interview likelihood from all agents.

Reads every workspace artifact, extracts each evaluative agent's implied
"vote" on whether this candidate would get an interview, then renders
a Captain's final judgment that factors in intangibles the individual
agents cannot see.

Produces: agent_verdicts (JSON), interview_verdict (markdown)
"""

import json
import logging
import re

from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)

# Agents whose artifacts contain evaluative signals (interview/pass)
VOTING_AGENTS = [
    {"agent": "scout", "artifact_type": "job_match_analysis", "label": "Scout"},
    {"agent": "ats_predictor", "artifact_type": "ats_score", "label": "ATS Predictor"},
    {"agent": "hiring_manager_sim", "artifact_type": "hiring_manager_review", "label": "Hiring Manager"},
    {"agent": "coach", "artifact_type": "interview_prep_guide", "label": "Coach"},
    {"agent": "strategist", "artifact_type": "application_strategy", "label": "Strategist"},
    {"agent": "brand_advisor", "artifact_type": "culture_analysis", "label": "Brand Advisor"},
]

FALLBACK_JSON = json.dumps({
    "verdicts": [],
    "captain": {
        "decision": "INSUFFICIENT_DATA",
        "confidence": 0,
        "headline": "Not enough agent data to render a verdict",
        "intangibles": [],
        "what_others_missed": "",
        "strategic_advice": "Run more agents first, then request the verdict again.",
    },
    "summary": {
        "interview_votes": 0,
        "pass_votes": 0,
        "total_agents": 0,
        "overall_sentiment": "insufficient_data",
    },
})


def _count_available_evaluative_artifacts(context: AgentContext) -> int:
    """Count how many voting-agent artifacts exist in the workspace."""
    available_types = {a.artifact_type for a in context.workspace_artifacts}
    return sum(
        1 for va in VOTING_AGENTS if va["artifact_type"] in available_types
    )


def _extract_json(response: str) -> str:
    """Extract JSON from an AI response, handling code fences and raw JSON.

    Returns a valid JSON string or the FALLBACK_JSON if extraction fails.
    """
    # Try code-fenced JSON first
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)
    if match:
        candidate = match.group(1)
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    # Try raw JSON (first { to last })
    first = response.find("{")
    last = response.rfind("}")
    if first != -1 and last > first:
        candidate = response[first : last + 1]
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    logger.warning("Failed to extract JSON from verdict response, using fallback")
    return FALLBACK_JSON


async def run_interview_verdict_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Synthesize all agent outputs into an interview likelihood verdict."""

    available_count = _count_available_evaluative_artifacts(context)

    # Build the voting-agents reference for the prompt
    voting_ref = "\n".join(
        f"- **{va['label']}** (artifact: `{va['artifact_type']}`)"
        for va in VOTING_AGENTS
    )

    # ── Task 1: Structured JSON verdicts ──────────────────────────────

    verdicts_prompt = f"""Analyze every agent artifact in the workspace and produce a structured
interview likelihood assessment.

## VOTING AGENTS
The following agents produce evaluative artifacts. For each one whose artifact
IS PRESENT in the workspace, extract an implied interview recommendation:
{voting_ref}

{available_count} of {len(VOTING_AGENTS)} evaluative artifacts are available.

## VOTE SCALE
Use exactly one of these values for each vote:
  strong_interview | interview | lean_interview | lean_pass | pass | strong_pass

## VOTE INTERPRETATION RUBRIC
- **Scout**: Match score 80+ → strong_interview, 65-79 → interview, 50-64 → lean_interview,
  35-49 → lean_pass, 20-34 → pass, <20 → strong_pass
- **ATS Predictor**: Predicted ATS score 85+ → strong_interview, 70-84 → interview,
  55-69 → lean_interview, 40-54 → lean_pass, 25-39 → pass, <25 → strong_pass
- **Hiring Manager Sim**: "Definitely call" → strong_interview, "Call" → interview,
  "Maybe" → lean_interview, "Probably not" → lean_pass, "No" → pass, "Hard no" → strong_pass
- **Coach**: Strong readiness → interview/strong_interview, moderate → lean_interview,
  significant gaps → lean_pass/pass
- **Strategist**: Low risk + strong leverage → interview, high risk + many objections → pass
- **Brand Advisor**: Strong culture alignment → interview, poor fit → pass

If a voting agent's artifact is NOT present, OMIT it from the verdicts array.

## NON-VOTING CONTEXT
Also consider these non-evaluative artifacts as background evidence (they inform
the Captain's decision but do not cast individual votes):
tailored_resume, amplified_resume, ageism_scrubbed_resume, ninety_day_plan,
outreach_message, interview_stories, talking_points

## CAPTAIN'S DECISION
After extracting individual votes, make the Captain's final call. The Captain
is a seasoned executive who listens to the bridge crew but sees what they miss:
- **Adaptability**: Career transitions, industry pivots, role expansions
- **Undocumented skills**: Skills evident from experience narratives but not listed
- **Learning velocity**: How fast they've grown between roles
- **Culture-add**: What unique perspective this candidate brings beyond culture fit
- **Transferable expertise**: Skills from adjacent domains that create unexpected value
The Captain's decision MAY differ from the majority vote. Explain why.

## OUTPUT FORMAT
Respond with ONLY a valid JSON object. No markdown, no code fences, no commentary.
Use this exact schema:

{{"verdicts": [{{"agent": "agent_key", "agent_label": "Display Name", "vote": "interview", "confidence": 85, "reasoning": "Brief explanation...", "key_factor": "One-line key factor"}}], "captain": {{"decision": "INTERVIEW or PASS", "confidence": 78, "headline": "One-sentence verdict headline", "intangibles": ["Factor 1", "Factor 2"], "what_others_missed": "What individual agents collectively failed to consider", "strategic_advice": "Concrete next-step advice for the candidate"}}, "summary": {{"interview_votes": 5, "pass_votes": 1, "total_agents": 6, "overall_sentiment": "strong_interview or interview or lean_interview or lean_pass or pass or strong_pass"}}}}"""

    verdicts_response = await call_agent_ai(
        context.db, "interview_verdict", verdicts_prompt, context
    )

    verdicts_json = _extract_json(verdicts_response)

    verdicts_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="interview_verdict",
        artifact_type="agent_verdicts",
        title=f"Agent Verdicts: {context.job.title} at {context.job.company}",
        content=verdicts_json,
        content_format="json",
    )

    # ── Task 2: Captain's narrative verdict (markdown) ────────────────

    narrative_prompt = f"""You are the Captain — a seasoned executive making the final interview
decision after reviewing your entire advisory team's analysis.

Here are the structured verdicts from Task 1:
```json
{verdicts_json}
```

Write a rich, compelling narrative verdict covering:

## Your Decision
State your final call clearly: INTERVIEW or PASS. Own it.

## Confidence Breakdown
Why you are or aren't confident. What would change your mind.

## What Your Advisory Team Got Right
Highlight the most insightful observations from the individual agents.

## What They Missed
This is your unique value. Address intangible factors:
- **Adaptability**: Evidence of career pivots, role evolution, industry transitions
- **Undocumented Skills**: Capabilities evident from experience patterns but never explicitly listed
- **Learning Velocity**: Growth rate between positions, expanding scope
- **Culture-Add Potential**: Unique perspectives, diverse background, fresh thinking
- **Transferable Expertise**: Skills from adjacent domains creating unexpected competitive advantage
- **Resilience Signals**: Evidence of overcoming setbacks, rebuilding, persisting

## Strategic Recommendation
Concrete, actionable advice for the candidate. What to do NOW based on all
the analysis. Should they apply immediately? Lead with the 90-day plan?
Reach out directly? Refine the resume first?

Be direct, honest, and decisive. This is a decision tool, not a feel-good exercise.
Format as rich markdown."""

    narrative_response = await call_agent_ai(
        context.db, "interview_verdict", narrative_prompt, context
    )

    narrative_artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="interview_verdict",
        artifact_type="interview_verdict",
        title=f"Interview Verdict: {context.job.title} at {context.job.company}",
        content=narrative_response,
    )

    return [verdicts_artifact, narrative_artifact]
