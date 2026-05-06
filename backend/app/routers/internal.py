import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.workspace import AgentWorkspace
from app.models.interview_journal import InterviewJournalEntry
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])


async def verify_internal_service(
    x_internal_service: str = Header(None),
    x_internal_secret: str = Header(None),
):
    if x_internal_service != "interview-simulator":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unknown service")
    if x_internal_secret != settings.JWT_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid service secret")


class ArtifactCreateRequest(BaseModel):
    user_id: uuid.UUID
    application_id: uuid.UUID
    agent_name: str = "interview_simulator"
    artifact_type: str = "interview_sim_debrief"
    title: str
    content: str
    content_format: str = "markdown"


class ArtifactCreateResponse(BaseModel):
    artifact_id: uuid.UUID
    workspace_id: uuid.UUID


@router.post(
    "/artifacts",
    response_model=ArtifactCreateResponse,
    dependencies=[Depends(verify_internal_service)],
)
async def create_artifact_internal(
    body: ArtifactCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentWorkspace).where(
            AgentWorkspace.application_id == body.application_id,
            AgentWorkspace.user_id == body.user_id,
        )
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="No workspace for this application")

    artifact = await save_artifact(
        db=db,
        workspace_id=workspace.id,
        agent_name=body.agent_name,
        artifact_type=body.artifact_type,
        title=body.title,
        content=body.content,
        content_format=body.content_format,
    )
    await db.commit()
    return ArtifactCreateResponse(artifact_id=artifact.id, workspace_id=workspace.id)


class JournalCreateRequest(BaseModel):
    user_id: uuid.UUID
    application_id: uuid.UUID
    entry_type: str = "voice_sim"
    title: str
    content: str
    outcome: str | None = None


class JournalCreateResponse(BaseModel):
    entry_id: uuid.UUID


@router.post(
    "/journal",
    response_model=JournalCreateResponse,
    dependencies=[Depends(verify_internal_service)],
)
async def create_journal_internal(
    body: JournalCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    entry = InterviewJournalEntry(
        user_id=body.user_id,
        application_id=body.application_id,
        entry_type=body.entry_type,
        title=body.title,
        content=body.content,
        outcome=body.outcome,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return JournalCreateResponse(entry_id=entry.id)
