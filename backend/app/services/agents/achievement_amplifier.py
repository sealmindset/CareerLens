"""Achievement Amplifier Agent -- Bullet point impact maximization.

Goes through every bullet point in the tailored resume and strengthens
task-descriptions into impact-statements. Cross-references the Story Bank
for verified metrics and facts.

CRITICAL: Never fabricates numbers -- only amplifies what exists or suggests
"[quantify this]" placeholders where metrics could strengthen a bullet.

Produces: amplified_resume
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story_bank import StoryBankStory
from app.models.workspace import WorkspaceArtifact
from app.services.agents.base import AgentContext, call_agent_ai
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)

MAX_STORY_CONTEXT_ENTRIES = 12


async def _load_story_bank(db: AsyncSession, user_id: uuid.UUID) -> list[StoryBankStory]:
    """Load all active stories from the user's Story Bank."""
    result = await db.execute(
        select(StoryBankStory).where(
            StoryBankStory.user_id == user_id,
            StoryBankStory.status == "active",
        )
    )
    return list(result.scalars().all())


def _format_story_bank_context(stories: list[StoryBankStory]) -> str:
    """Format Story Bank stories as verified-facts context for the amplifier."""
    if not stories:
        return ""

    parts = [
        "## Verified Facts from Story Bank\n",
        "The following facts have been verified through direct candidate interviews. "
        "When amplifying bullets that correspond to these stories, use ONLY the verified "
        "numbers and outcomes below. Do NOT invent metrics beyond what is stated here.\n",
    ]

    for story in stories[:MAX_STORY_CONTEXT_ENTRIES]:
        role_label = f"{story.source_title or 'Role'} at {story.source_company or 'Company'}"
        parts.append(f"**{role_label}** — \"{story.story_title}\"")
        if story.proof_metric:
            parts.append(f"  Verified Metric: {story.proof_metric}")
        if story.deployed:
            preview = story.deployed[:200]
            if len(story.deployed) > 200:
                preview += "..."
            parts.append(f"  Verified Result: {preview}")
        parts.append("")

    return "\n".join(parts)


def _get_best_resume_content(context: AgentContext) -> str:
    """Get the best available resume: ageism_scrubbed > tailored."""
    for artifact_type in ("ageism_scrubbed_resume", "tailored_resume"):
        for artifact in context.workspace_artifacts:
            if artifact.artifact_type == artifact_type:
                return artifact.content
    return ""


async def run_achievement_amplifier_task(context: AgentContext) -> list[WorkspaceArtifact]:
    """Run the Achievement Amplifier agent."""

    resume_content = _get_best_resume_content(context)
    stories = await _load_story_bank(context.db, context.user_id)
    story_context = _format_story_bank_context(stories)

    amplify_prompt = f"""You are rewriting every bullet point in this resume to maximize impact.

## Resume to Amplify

{resume_content}

{story_context}

## YOUR MISSION

Transform every task-description bullet into an impact-statement bullet. The difference:

- TASK: "Managed a team of engineers working on the platform"
- IMPACT: "Led 8-person engineering team that shipped the core platform 3 weeks ahead of schedule, reducing infrastructure costs by 40%"

- TASK: "Responsible for quarterly reporting"
- IMPACT: "Redesigned quarterly reporting pipeline, cutting report generation from 5 days to 4 hours and enabling real-time executive decision-making"

## RULES

1. **NEVER FABRICATE NUMBERS.** This is the most important rule.
   - If the original bullet has a number, keep it or make it more specific
   - If the Story Bank has a verified metric for this experience, USE IT
   - If no number exists, suggest a placeholder: "[quantify: e.g., reduced by X%]"
   - NEVER invent percentages, dollar amounts, team sizes, or timeframes

2. **Transform the verb structure:**
   - Replace passive/weak verbs (managed, responsible for, helped with)
   - Use power verbs: architected, spearheaded, orchestrated, accelerated, drove, delivered, launched, scaled, optimized, transformed

3. **Add the "so what":**
   - Every bullet should answer: "What was the business impact?"
   - Pattern: [Action verb] + [What you did] + [Measurable result OR business impact]

4. **Preserve authenticity:**
   - Do not change job titles, company names, or dates
   - Do not add skills or experiences the candidate doesn't have
   - Keep the candidate's voice -- amplify, don't replace

5. **Handle thin bullets:**
   - If a bullet is generic and cannot be amplified without fabrication, rewrite it
     with the strongest truthful framing possible and add [needs detail from candidate]

6. **Section structure:**
   - Keep the same resume sections and ordering
   - Professional Summary should also be amplified for maximum impact
   - Skills section: no changes needed (pass through as-is)

## OUTPUT FORMAT

Produce the COMPLETE resume with every bullet amplified. Use clean markdown.
Do NOT include any commentary, annotations, or before/after comparisons.
The output must be a submission-ready resume -- nothing more.

Where you've inserted placeholders, use this exact format: [quantify: suggestion here]"""

    response = await call_agent_ai(
        context.db, "achievement_amplifier", amplify_prompt, context
    )

    artifact = await save_artifact(
        db=context.db,
        workspace_id=context.workspace_id,
        agent_name="achievement_amplifier",
        artifact_type="amplified_resume",
        title=f"Amplified Resume: {context.job.title} at {context.job.company}",
        content=response,
    )

    return [artifact]
