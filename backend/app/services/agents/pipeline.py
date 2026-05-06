"""Agent Pipeline -- Automatic agent chaining.

Runs agents in sequence, each building on the previous agent's output.
Two pipeline types:
- "full": Scout → Tailor → Amplifier → ATS → HM Sim → Coach → Talking Points → Cover Letter → Strategist → Brand Advisor → 90-Day → Outreach → Coordinator
- "quick": Scout → Tailor → Amplifier → ATS → HM Sim → Talking Points → Strategist (essentials only)
"""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import PipelineRun, WorkspaceArtifact
from app.services.agents import AGENT_RUNNERS
from app.services.agents.base import AgentContext, build_shared_prompt_parts, load_agent_context
from app.services.workspace_service import (
    create_pipeline_run,
    get_artifacts,
    update_pipeline_run,
)

logger = logging.getLogger(__name__)

PIPELINE_SEQUENCES = {
    "full": [
        "scout", "tailor",
        "achievement_amplifier", "ats_predictor", "hiring_manager_sim",
        "coach", "talking_points", "cover_letter", "strategist", "brand_advisor",
        "ninety_day_plan", "outreach_drafter", "coordinator",
    ],
    "quick": [
        "scout", "tailor",
        "achievement_amplifier", "ats_predictor", "hiring_manager_sim",
        "talking_points", "strategist",
    ],
}


async def run_pipeline(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    application_id: uuid.UUID,
    user_id: uuid.UUID,
    pipeline_type: str = "full",
    additional_instructions: str | None = None,
) -> PipelineRun:
    """Run an agent pipeline, executing agents in sequence.

    Each agent receives the context including all previous agents' outputs.
    """
    sequence = PIPELINE_SEQUENCES.get(pipeline_type, PIPELINE_SEQUENCES["full"])
    run = await create_pipeline_run(db, workspace_id, pipeline_type)

    await update_pipeline_run(db, run.id, status="running")
    await db.commit()

    all_artifacts: list[WorkspaceArtifact] = []

    # Load context once — profile, job, and application don't change during a pipeline run
    context = await load_agent_context(
        db=db,
        user_id=user_id,
        workspace_id=workspace_id,
        application_id=application_id,
        additional_instructions=additional_instructions,
    )

    # Pre-compute expensive prompt parts (profile RAG, job, story bank) once for all agents
    context.cached_prompt_parts = await build_shared_prompt_parts(context)

    for agent_name in sequence:
        runner = AGENT_RUNNERS.get(agent_name)
        if not runner:
            logger.warning("No runner for agent '%s', skipping", agent_name)
            continue

        try:
            await update_pipeline_run(db, run.id, current_agent=agent_name)
            await db.commit()

            # Only refresh workspace artifacts (new outputs from prior agents)
            context.workspace_artifacts = await get_artifacts(db, workspace_id)

            logger.info("Pipeline '%s': running agent '%s'", pipeline_type, agent_name)
            artifacts = await runner(context)
            all_artifacts.extend(artifacts)

            await update_pipeline_run(
                db, run.id, completed_agent=agent_name
            )
            await db.commit()

        except Exception as e:
            logger.error(
                "Pipeline '%s' failed at agent '%s': %s",
                pipeline_type, agent_name, str(e),
            )
            await update_pipeline_run(
                db, run.id,
                status="failed",
                error_message=f"Failed at {agent_name}: {str(e)}",
            )
            await db.commit()
            return run

    await update_pipeline_run(db, run.id, status="completed", current_agent=None)
    await db.commit()
    await db.refresh(run)
    return run
