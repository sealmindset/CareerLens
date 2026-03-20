"""Workspace service -- manages shared agent workspaces and artifacts."""

import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application
from app.models.workspace import AgentWorkspace, PipelineRun, WorkspaceArtifact


async def get_or_create_workspace(
    db: AsyncSession,
    application_id: uuid.UUID,
    user_id: uuid.UUID,
) -> AgentWorkspace:
    """Get existing workspace for an application, or create one."""
    result = await db.execute(
        select(AgentWorkspace).where(AgentWorkspace.application_id == application_id)
    )
    workspace = result.scalar_one_or_none()

    if not workspace:
        # Verify the application belongs to this user
        app_result = await db.execute(
            select(Application).where(
                Application.id == application_id,
                Application.user_id == user_id,
            )
        )
        application = app_result.scalar_one_or_none()
        if not application:
            raise ValueError("Application not found or doesn't belong to user")

        workspace = AgentWorkspace(
            application_id=application_id,
            user_id=user_id,
        )
        db.add(workspace)
        await db.flush()
        await db.refresh(workspace)

    return workspace


async def save_artifact(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    agent_name: str,
    artifact_type: str,
    title: str,
    content: str,
    content_format: str = "markdown",
) -> WorkspaceArtifact:
    """Save an artifact to the workspace, auto-incrementing version."""
    # Check for existing artifacts of this type to determine version
    result = await db.execute(
        select(WorkspaceArtifact).where(
            WorkspaceArtifact.workspace_id == workspace_id,
            WorkspaceArtifact.artifact_type == artifact_type,
        ).order_by(WorkspaceArtifact.version.desc())
    )
    existing = result.scalars().first()
    next_version = (existing.version + 1) if existing else 1

    artifact = WorkspaceArtifact(
        workspace_id=workspace_id,
        agent_name=agent_name,
        artifact_type=artifact_type,
        title=title,
        content=content,
        content_format=content_format,
        version=next_version,
    )
    db.add(artifact)
    await db.flush()
    await db.refresh(artifact)
    return artifact


async def get_artifacts(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    artifact_type: str | None = None,
    agent_name: str | None = None,
) -> list[WorkspaceArtifact]:
    """Get artifacts from a workspace, optionally filtered."""
    query = select(WorkspaceArtifact).where(
        WorkspaceArtifact.workspace_id == workspace_id
    )
    if artifact_type:
        query = query.where(WorkspaceArtifact.artifact_type == artifact_type)
    if agent_name:
        query = query.where(WorkspaceArtifact.agent_name == agent_name)

    query = query.order_by(WorkspaceArtifact.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_latest_artifact(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    artifact_type: str,
) -> WorkspaceArtifact | None:
    """Get the most recent version of a specific artifact type."""
    result = await db.execute(
        select(WorkspaceArtifact).where(
            WorkspaceArtifact.workspace_id == workspace_id,
            WorkspaceArtifact.artifact_type == artifact_type,
        ).order_by(WorkspaceArtifact.version.desc())
    )
    return result.scalars().first()


async def create_pipeline_run(
    db: AsyncSession,
    workspace_id: uuid.UUID,
    pipeline_type: str,
) -> PipelineRun:
    """Create a new pipeline run record."""
    run = PipelineRun(
        workspace_id=workspace_id,
        pipeline_type=pipeline_type,
        status="pending",
        completed_agents="[]",
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)
    return run


async def update_pipeline_run(
    db: AsyncSession,
    run_id: uuid.UUID,
    status: str | None = None,
    current_agent: str | None = None,
    completed_agent: str | None = None,
    error_message: str | None = None,
) -> PipelineRun:
    """Update a pipeline run's status."""
    result = await db.execute(
        select(PipelineRun).where(PipelineRun.id == run_id)
    )
    run = result.scalar_one()

    if status:
        run.status = status
    if current_agent is not None:
        run.current_agent = current_agent
    if completed_agent:
        completed = json.loads(run.completed_agents)
        completed.append(completed_agent)
        run.completed_agents = json.dumps(completed)
    if error_message is not None:
        run.error_message = error_message

    await db.flush()
    await db.refresh(run)
    return run


def build_workspace_context(
    artifacts: list[WorkspaceArtifact],
) -> str:
    """Build a context string from workspace artifacts for agent prompts."""
    if not artifacts:
        return ""

    parts = ["## Workspace Context (from other agents)\n"]
    for artifact in artifacts:
        parts.append(f"### {artifact.title} (by {artifact.agent_name.replace('_', ' ').title()})")
        # Truncate very long artifacts to keep context manageable
        content = artifact.content
        if len(content) > 3000:
            content = content[:3000] + "\n\n[... truncated for brevity ...]"
        parts.append(content)
        parts.append("")

    return "\n".join(parts)
