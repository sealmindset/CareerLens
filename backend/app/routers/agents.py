import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agent_service import generate_agent_response
from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.agent_conversation import AgentConversation, AgentMessage
from app.models.user import User
from app.models.workspace import AgentWorkspace, WorkspaceArtifact
from app.schemas.agent import ConversationCreate, ConversationOut, MessageCreate, MessageOut
from app.schemas.auth import UserInfo
from app.schemas.workspace import (
    AgentTaskRequest,
    AgentTaskResult,
    ArtifactOut,
    PipelineRunOut,
    PipelineStartRequest,
    PreflightResult,
    WorkspaceCreate,
    WorkspaceOut,
)
from app.services.agent_preflight import AGENT_REQUIREMENTS, run_preflight
from app.services.agents import AGENT_RUNNERS
from app.services.agents.base import load_agent_context
from app.services.agents.pipeline import run_pipeline
from app.services.export_service import export_to_docx, export_to_pdf
from app.services.workspace_service import get_artifacts, get_or_create_workspace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up the DB user id from the OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


# ─── Conversation endpoints (existing) ───────────────────────────────

@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    current_user: UserInfo = Depends(require_permission("agents", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List current user's agent conversations."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(AgentConversation)
        .where(AgentConversation.user_id == user_id)
        .order_by(AgentConversation.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/{agent_name}/conversations", response_model=list[ConversationOut])
async def list_agent_conversations(
    agent_name: str,
    current_user: UserInfo = Depends(require_permission("agents", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List current user's conversations for a specific agent."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_id == user_id,
            AgentConversation.agent_name == agent_name,
        )
        .order_by(AgentConversation.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/{agent_name}/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_agent_conversation(
    agent_name: str,
    data: ConversationCreate,
    current_user: UserInfo = Depends(require_permission("agents", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Start a new conversation with a specific agent."""
    user_id = await _get_user_id(db, current_user)
    conversation = AgentConversation(
        user_id=user_id,
        agent_name=agent_name,
        **data.model_dump(exclude={"agent_name"}),
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    current_user: UserInfo = Depends(require_permission("agents", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Start a new agent conversation."""
    user_id = await _get_user_id(db, current_user)
    conversation = AgentConversation(user_id=user_id, **data.model_dump())
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("/conversations/{conv_id}/messages", response_model=list[MessageOut])
async def get_messages(
    conv_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("agents", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get messages for a conversation."""
    user_id = await _get_user_id(db, current_user)
    conv_result = await db.execute(
        select(AgentConversation).where(
            AgentConversation.id == conv_id,
            AgentConversation.user_id == user_id,
        )
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )
    result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conv_id)
        .order_by(AgentMessage.created_at.asc())
    )
    return result.scalars().all()


class MessagePairOut(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut


@router.post("/conversations/{conv_id}/messages", response_model=MessagePairOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    conv_id: uuid.UUID,
    data: MessageCreate,
    current_user: UserInfo = Depends(require_permission("agents", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to a conversation and get AI response."""
    user_id = await _get_user_id(db, current_user)
    conv_result = await db.execute(
        select(AgentConversation).where(
            AgentConversation.id == conv_id,
            AgentConversation.user_id == user_id,
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    user_message = AgentMessage(
        conversation_id=conv_id,
        role="user",
        content=data.content,
    )
    db.add(user_message)
    await db.flush()

    # If conversation is scoped to a job application, inject full context
    application_id = conversation.context_id if conversation.context_id else None

    ai_content = await generate_agent_response(
        db=db,
        agent_name=conversation.agent_name,
        conversation_id=str(conv_id),
        user_message=data.content,
        application_id=application_id,
        user_id=user_id,
    )

    ai_message = AgentMessage(
        conversation_id=conv_id,
        role="assistant",
        content=ai_content,
    )
    db.add(ai_message)
    await db.commit()
    await db.refresh(user_message)
    await db.refresh(ai_message)
    return MessagePairOut(user_message=user_message, assistant_message=ai_message)


# ─── Workspace endpoints (new) ───────────────────────────────────────

@router.post("/workspaces", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: WorkspaceCreate,
    current_user: UserInfo = Depends(require_permission("workspace", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Create or get a workspace for a job application."""
    user_id = await _get_user_id(db, current_user)
    try:
        workspace = await get_or_create_workspace(db, data.application_id, user_id)
        await db.commit()
        await db.refresh(workspace)
        return workspace
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("workspace", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get a workspace with all its artifacts."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.id == workspace_id,
            AgentWorkspace.user_id == user_id,
        )
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


@router.get("/workspaces/by-application/{application_id}", response_model=WorkspaceOut)
async def get_workspace_by_application(
    application_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("workspace", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get the workspace for a specific application."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.application_id == application_id,
            AgentWorkspace.user_id == user_id,
        )
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No workspace for this application")
    return workspace


@router.get("/workspaces/{workspace_id}/artifacts", response_model=list[ArtifactOut])
async def list_artifacts(
    workspace_id: uuid.UUID,
    agent_name: str | None = None,
    artifact_type: str | None = None,
    current_user: UserInfo = Depends(require_permission("workspace", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List artifacts in a workspace, optionally filtered."""
    user_id = await _get_user_id(db, current_user)
    # Verify workspace ownership
    ws_result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.id == workspace_id,
            AgentWorkspace.user_id == user_id,
        )
    )
    if not ws_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    artifacts = await get_artifacts(db, workspace_id, artifact_type, agent_name)
    return artifacts


# ─── Artifact export endpoints ───────────────────────────────────────

@router.get("/workspaces/{workspace_id}/artifacts/{artifact_id}/export")
async def export_artifact(
    workspace_id: uuid.UUID,
    artifact_id: uuid.UUID,
    format: str = Query(..., pattern="^(pdf|docx)$"),
    current_user: UserInfo = Depends(require_permission("workspace", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Export a workspace artifact as PDF or DOCX."""
    user_id = await _get_user_id(db, current_user)

    # Verify workspace ownership
    ws_result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.id == workspace_id,
            AgentWorkspace.user_id == user_id,
        )
    )
    if not ws_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    # Load artifact
    art_result = await db.execute(
        select(WorkspaceArtifact).where(
            WorkspaceArtifact.id == artifact_id,
            WorkspaceArtifact.workspace_id == workspace_id,
        )
    )
    artifact = art_result.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")

    # Generate safe filename from artifact title
    safe_title = "".join(c if c.isalnum() or c in " -_" else "" for c in artifact.title).strip()
    safe_title = safe_title.replace(" ", "_") or "document"

    try:
        if format == "pdf":
            content_bytes = export_to_pdf(artifact.content)
            media_type = "application/pdf"
            filename = f"{safe_title}.pdf"
        else:
            content_bytes = export_to_docx(artifact.content)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = f"{safe_title}.docx"
    except Exception as e:
        logger.error("Export failed for artifact %s: %s", artifact_id, str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document export failed",
        )

    return Response(
        content=content_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Preflight endpoints ─────────────────────────────────────────────

@router.get("/preflight/all/{application_id}", response_model=list[PreflightResult])
async def check_all_preflights(
    application_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("workspace", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Check preflight status for all agents against a specific application."""
    user_id = await _get_user_id(db, current_user)
    results = []
    for agent_name in AGENT_REQUIREMENTS:
        result = await run_preflight(db, agent_name, user_id, application_id)
        results.append(result)
    return results


@router.get("/preflight/{agent_name}/{application_id}", response_model=PreflightResult)
async def check_preflight(
    agent_name: str,
    application_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("workspace", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Check if an agent has all the data it needs for a specific application."""
    user_id = await _get_user_id(db, current_user)
    return await run_preflight(db, agent_name, user_id, application_id)


# ─── Agent task endpoints (user-directed mode) ───────────────────────

@router.post("/workspaces/{workspace_id}/run-agent", response_model=AgentTaskResult)
async def run_agent_task(
    workspace_id: uuid.UUID,
    data: AgentTaskRequest,
    current_user: UserInfo = Depends(require_permission("workspace", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Run a specific agent against a workspace (user-directed mode)."""
    user_id = await _get_user_id(db, current_user)

    # Verify workspace ownership
    ws_result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.id == workspace_id,
            AgentWorkspace.user_id == user_id,
        )
    )
    workspace = ws_result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    runner = AGENT_RUNNERS.get(data.agent_name)
    if not runner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown agent: {data.agent_name}",
        )

    # Run preflight (advisory, not blocking)
    preflight = await run_preflight(
        db, data.agent_name, user_id, workspace.application_id
    )
    preflight_warnings = [i for i in preflight.items if i.status in ("missing", "partial")]

    # Load context and run the agent
    context = await load_agent_context(
        db=db,
        user_id=user_id,
        workspace_id=workspace_id,
        application_id=workspace.application_id,
        additional_instructions=data.additional_instructions,
    )

    try:
        artifacts = await runner(context)
        await db.commit()
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Agent failed: {str(e)}",
        )

    # Determine next suggested agent
    reqs = AGENT_REQUIREMENTS.get(data.agent_name, {})
    next_agent = reqs.get("next_agent")

    summary_parts = [f"{data.agent_name.replace('_', ' ').title()} completed."]
    summary_parts.append(f"Created {len(artifacts)} artifact(s):")
    for a in artifacts:
        summary_parts.append(f"  - {a.title}")
    if next_agent:
        summary_parts.append(f"Suggested next: {next_agent.replace('_', ' ').title()}")

    return AgentTaskResult(
        agent_name=data.agent_name,
        artifacts_created=[ArtifactOut.model_validate(a) for a in artifacts],
        summary="\n".join(summary_parts),
        next_suggested_agent=next_agent,
        preflight_warnings=preflight_warnings,
    )


# ─── Pipeline endpoints (automatic chaining) ─────────────────────────

@router.post("/workspaces/{workspace_id}/pipeline", response_model=PipelineRunOut)
async def start_pipeline(
    workspace_id: uuid.UUID,
    data: PipelineStartRequest,
    current_user: UserInfo = Depends(require_permission("workspace", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Start an automatic agent pipeline on a workspace."""
    user_id = await _get_user_id(db, current_user)

    # Verify workspace ownership
    ws_result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.id == workspace_id,
            AgentWorkspace.user_id == user_id,
        )
    )
    workspace = ws_result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    if data.pipeline_type not in ("full", "quick"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pipeline_type must be 'full' or 'quick'",
        )

    run = await run_pipeline(
        db=db,
        workspace_id=workspace_id,
        application_id=workspace.application_id,
        user_id=user_id,
        pipeline_type=data.pipeline_type,
    )

    return run
