import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models.question import InterviewSimQuestion
from app.models.session import InterviewSimSession
from app.schemas.session import (
    DebriefOut,
    SessionCreate,
    SessionDetailOut,
    SessionListOut,
    SessionOut,
)
from app.services.debrief_generator import generate_debrief
from app.services.export_service import export_debrief_to_workspace
from app.services.question_generator import generate_questions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sim/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: SessionCreate,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])

    # Check concurrent session limit
    active_count = (
        await db.execute(
            select(InterviewSimSession)
            .where(
                InterviewSimSession.user_id == user_id,
                InterviewSimSession.status.in_(["pending", "active"]),
            )
        )
    ).scalars().all()

    if len(active_count) >= settings.MAX_CONCURRENT_SESSIONS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Maximum {settings.MAX_CONCURRENT_SESSIONS_PER_USER} concurrent sessions allowed",
        )

    session = InterviewSimSession(
        user_id=user_id,
        application_id=data.application_id,
        job_title=data.job_title,
        company=data.company,
        job_description=data.job_description,
        interviewer_context=data.interviewer_context,
        interview_style=data.interview_style,
        question_count=data.question_count,
        agent_context=data.agent_context.model_dump() if data.agent_context else None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    logger.info("Created session %s for user %s", session.id, user_id)
    return session


@router.get("", response_model=list[SessionListOut])
async def list_sessions(
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    result = await db.execute(
        select(InterviewSimSession)
        .where(InterviewSimSession.user_id == user_id)
        .order_by(InterviewSimSession.created_at.desc())
    )
    return result.scalars().all()


@router.get("/ws-token")
async def get_ws_token(request: Request):
    """Return the auth token for WebSocket connections."""
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="No auth token")
    return {"token": token}


@router.get("/{session_id}", response_model=SessionDetailOut)
async def get_session(
    session_id: uuid.UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    session = await db.get(InterviewSimSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    session = await db.get(InterviewSimSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    await db.delete(session)
    await db.commit()


@router.post("/{session_id}/generate-questions", response_model=SessionDetailOut)
async def generate_session_questions(
    session_id: uuid.UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    session = await db.get(InterviewSimSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Questions can only be generated for pending sessions",
        )

    logger.info("Generating %d questions for session %s...", session.question_count, session_id)
    questions_data = await generate_questions(
        job_title=session.job_title,
        company=session.company,
        job_description=session.job_description,
        interviewer_context=session.interviewer_context,
        interview_style=session.interview_style,
        question_count=session.question_count,
        agent_context=session.agent_context,
    )

    for q in questions_data:
        db.add(InterviewSimQuestion(
            session_id=session_id,
            question_index=q["index"],
            question_text=q["text"],
            question_type=q["type"],
            expected_signals=q.get("expected_signals"),
        ))

    session.status = "ready"
    await db.commit()
    await db.refresh(session)
    logger.info("Session %s ready with %d questions", session_id, len(questions_data))
    return session


@router.get("/{session_id}/debrief", response_model=DebriefOut)
async def get_debrief(
    session_id: uuid.UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    session = await db.get(InterviewSimSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if not session.debrief:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Debrief not generated yet")
    return session.debrief


@router.post("/{session_id}/export")
async def export_to_workspace(
    session_id: uuid.UUID,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = uuid.UUID(user["user_id"])
    session = await db.get(InterviewSimSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if not session.debrief:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generate debrief first")
    if not session.application_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session not linked to an application",
        )

    debrief = session.debrief
    result = await export_debrief_to_workspace(db, session, debrief)
    if result is None:
        raise HTTPException(status_code=502, detail="Export to workspace failed")
    return result


