"""Resume chat endpoints — coach + proposer model.

One persistent chat per (user, workspace, agent). Agents: tailor,
achievement_amplifier. The AI coaches in plain English and may propose a
revised full resume; the user clicks Apply to accept or Dismiss to drop
the proposal. Publish writes a new WorkspaceArtifact version.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.permissions import require_permission
from app.models.agent_conversation import AgentConversation
from app.models.user import User
from app.schemas.auth import UserInfo
from app.services import resume_chat_service

router = APIRouter(prefix="/api/resume-chat", tags=["resume-chat"])

AgentName = Literal["tailor", "achievement_amplifier"]


# ─── Helpers ───────────────────────────────────────────────────────────────


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(
        select(User).where(User.oidc_subject == current_user.sub)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user.id


async def _get_owned_chat(
    db: AsyncSession, user_id: uuid.UUID, chat_id: uuid.UUID
) -> AgentConversation:
    convo = await db.get(AgentConversation, chat_id)
    if convo is None or convo.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found"
        )
    return convo


# ─── Schemas ───────────────────────────────────────────────────────────────


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    created_at: str

    @classmethod
    def from_orm_row(cls, m) -> "MessageOut":
        return cls(
            id=m.id,
            role=m.role,
            content=m.content,
            created_at=m.created_at.isoformat(),
        )


class PendingProposalOut(BaseModel):
    text: str
    proposed_at: str


class ChatOut(BaseModel):
    id: uuid.UUID
    agent_name: str
    workspace_id: uuid.UUID
    job_id: uuid.UUID | None = None
    draft_resume_text: str
    loaded_artifact_id: uuid.UUID | None = None
    loaded_artifact_version: int | None = None
    loaded_artifact_title: str | None = None
    pending_proposal: PendingProposalOut | None = None
    messages: list[MessageOut]


class GetOrCreateChatRequest(BaseModel):
    agent_name: AgentName
    workspace_id: uuid.UUID


class LatestArtifactExistsRequest(BaseModel):
    agent_name: AgentName
    workspace_id: uuid.UUID


class LatestArtifactExistsResponse(BaseModel):
    exists: bool


class SendRequest(BaseModel):
    resume_text: str = Field(default="")
    note: str = Field(default="")


class SendResponse(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut
    draft_resume_text: str
    pending_proposal: PendingProposalOut | None = None


class ApplyResponse(BaseModel):
    assistant_message: MessageOut
    draft_resume_text: str


class PublishResponse(BaseModel):
    artifact_id: uuid.UUID
    workspace_id: uuid.UUID
    artifact_type: str
    agent_name: str
    title: str
    version: int


# ─── Chat assembly ─────────────────────────────────────────────────────────


def _build_chat_out(convo: AgentConversation) -> ChatOut:
    draft = convo.draft_resume or {}
    loaded_id = draft.get("loaded_artifact_id")
    try:
        loaded_uuid = uuid.UUID(loaded_id) if loaded_id else None
    except (TypeError, ValueError):
        loaded_uuid = None
    loaded_version = draft.get("loaded_artifact_version")
    if not isinstance(loaded_version, int):
        loaded_version = None
    loaded_title = draft.get("loaded_artifact_title")
    if not isinstance(loaded_title, str):
        loaded_title = None

    pending = resume_chat_service.get_pending_proposal(convo)
    pending_out: PendingProposalOut | None = None
    if pending is not None:
        pending_out = PendingProposalOut(
            text=str(pending.get("text") or ""),
            proposed_at=str(pending.get("proposed_at") or ""),
        )

    return ChatOut(
        id=convo.id,
        agent_name=convo.agent_name,
        workspace_id=convo.workspace_id,
        job_id=convo.job_id,
        draft_resume_text=str(draft.get("raw_resume_text") or ""),
        loaded_artifact_id=loaded_uuid,
        loaded_artifact_version=loaded_version,
        loaded_artifact_title=loaded_title,
        pending_proposal=pending_out,
        messages=[MessageOut.from_orm_row(m) for m in convo.messages],
    )


# ─── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/chats", response_model=ChatOut)
async def get_or_create_chat_endpoint(
    body: GetOrCreateChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
):
    """Get or create the single chat for this (user, workspace, agent).
    Auto-loads the latest resume artifact of this agent's type into the draft.
    """
    user_id = await _get_user_id(db, current_user)
    try:
        convo = await resume_chat_service.get_or_create_chat(
            db=db,
            user_id=user_id,
            workspace_id=body.workspace_id,
            agent_name=body.agent_name,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    return _build_chat_out(convo)


@router.post("/latest-exists", response_model=LatestArtifactExistsResponse)
async def latest_artifact_exists_endpoint(
    body: LatestArtifactExistsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
):
    """Preflight check for the Chat icon: returns whether the agent has
    produced a resume artifact yet in this workspace."""
    exists = await resume_chat_service.latest_artifact_exists(
        db=db,
        workspace_id=body.workspace_id,
        agent_name=body.agent_name,
    )
    return LatestArtifactExistsResponse(exists=exists)


@router.get("/chats/{chat_id}", response_model=ChatOut)
async def get_chat_endpoint(
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(require_permission("resumes", "view")),
):
    user_id = await _get_user_id(db, current_user)
    convo = await _get_owned_chat(db, user_id, chat_id)
    return _build_chat_out(convo)


@router.post("/chats/{chat_id}/send", response_model=SendResponse)
async def send_endpoint(
    chat_id: uuid.UUID,
    body: SendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
):
    user_id = await _get_user_id(db, current_user)
    convo = await _get_owned_chat(db, user_id, chat_id)
    try:
        user_msg, assistant_msg = await resume_chat_service.send_turn(
            db=db,
            convo=convo,
            resume_text=body.resume_text,
            note=body.note,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)
        )

    pending = resume_chat_service.get_pending_proposal(convo)
    pending_out: PendingProposalOut | None = None
    if pending is not None:
        pending_out = PendingProposalOut(
            text=str(pending.get("text") or ""),
            proposed_at=str(pending.get("proposed_at") or ""),
        )

    return SendResponse(
        user_message=MessageOut.from_orm_row(user_msg),
        assistant_message=MessageOut.from_orm_row(assistant_msg),
        draft_resume_text=resume_chat_service.get_draft_text(convo),
        pending_proposal=pending_out,
    )


@router.post("/chats/{chat_id}/apply", response_model=ApplyResponse)
async def apply_proposal_endpoint(
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
):
    """Accept the pending AI proposal: overwrite the draft with the AI's
    revised resume and clear the pending proposal."""
    user_id = await _get_user_id(db, current_user)
    convo = await _get_owned_chat(db, user_id, chat_id)
    try:
        assistant_msg = await resume_chat_service.apply_proposal(db, convo)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    return ApplyResponse(
        assistant_message=MessageOut.from_orm_row(assistant_msg),
        draft_resume_text=resume_chat_service.get_draft_text(convo),
    )


@router.post("/chats/{chat_id}/dismiss", response_model=ChatOut)
async def dismiss_proposal_endpoint(
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
):
    """Drop the pending AI proposal; the current draft stays unchanged."""
    user_id = await _get_user_id(db, current_user)
    convo = await _get_owned_chat(db, user_id, chat_id)
    await resume_chat_service.dismiss_proposal(db, convo)
    return _build_chat_out(convo)


@router.post("/chats/{chat_id}/publish", response_model=PublishResponse)
async def publish_endpoint(
    chat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(require_permission("resumes", "edit")),
):
    user_id = await _get_user_id(db, current_user)
    convo = await _get_owned_chat(db, user_id, chat_id)
    try:
        published = await resume_chat_service.publish_draft(db, convo)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
    return PublishResponse(
        artifact_id=published.id,
        workspace_id=published.workspace_id,
        artifact_type=published.artifact_type,
        agent_name=published.agent_name,
        title=published.title,
        version=published.version,
    )
