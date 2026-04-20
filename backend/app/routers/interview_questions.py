"""Interview Question Bank endpoints.

Stores real interview questions the user has been asked, tagged by company /
role / topic. Questions can link to StoryBank entries that serve as strong
answers — the basis for future RAG-style retrieval during interview prep.
"""

from __future__ import annotations

import uuid

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.interview_question import InterviewQuestion
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.interview_question import (
    BulkCreateRequest,
    FileImportResult,
    InterviewQuestionCreate,
    InterviewQuestionOut,
    InterviewQuestionSummary,
    InterviewQuestionUpdate,
    TranscribeResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/interview-questions", tags=["interview-questions"]
)


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


async def _get_owned(
    db: AsyncSession, user_id: uuid.UUID, question_id: uuid.UUID
) -> InterviewQuestion:
    q = await db.get(InterviewQuestion, question_id)
    if q is None or q.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview question not found",
        )
    return q


@router.get(
    "",
    response_model=list[InterviewQuestionOut],
    dependencies=[Depends(require_permission("interview_questions", "view"))],
)
async def list_questions(
    status_filter: str | None = Query(None, alias="status"),
    company: str | None = None,
    topic: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    query = select(InterviewQuestion).where(
        InterviewQuestion.user_id == user_id
    )
    if status_filter:
        query = query.where(InterviewQuestion.status == status_filter)
    if company:
        query = query.where(InterviewQuestion.company.ilike(f"%{company}%"))
    query = query.order_by(
        InterviewQuestion.date_asked.desc().nullslast(),
        InterviewQuestion.created_at.desc(),
    )
    result = await db.execute(query)
    rows = list(result.scalars().all())
    if topic:
        rows = [
            r for r in rows
            if r.topic_tags and any(
                topic.lower() in str(t).lower() for t in r.topic_tags
            )
        ]
    return rows


@router.get(
    "/summary",
    response_model=InterviewQuestionSummary,
    dependencies=[Depends(require_permission("interview_questions", "view"))],
)
async def summary(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)

    total = await db.scalar(
        select(func.count()).select_from(InterviewQuestion).where(
            InterviewQuestion.user_id == user_id
        )
    )
    active = await db.scalar(
        select(func.count()).select_from(InterviewQuestion).where(
            InterviewQuestion.user_id == user_id,
            InterviewQuestion.status == "active",
        )
    )
    archived = await db.scalar(
        select(func.count()).select_from(InterviewQuestion).where(
            InterviewQuestion.user_id == user_id,
            InterviewQuestion.status == "archived",
        )
    )
    companies = await db.scalar(
        select(func.count(func.distinct(InterviewQuestion.company))).where(
            InterviewQuestion.user_id == user_id,
            InterviewQuestion.company.isnot(None),
        )
    )
    latest = await db.scalar(
        select(func.max(InterviewQuestion.date_asked)).where(
            InterviewQuestion.user_id == user_id
        )
    )
    return InterviewQuestionSummary(
        total_count=total or 0,
        active_count=active or 0,
        archived_count=archived or 0,
        unique_companies=companies or 0,
        most_recent_date=latest,
    )


@router.post(
    "/import-file",
    response_model=FileImportResult,
    dependencies=[Depends(require_permission("interview_questions", "create"))],
)
async def import_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    from app.services.question_parser_service import parse_questions_from_file

    try:
        parsed = await parse_questions_from_file(contents, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not parsed:
        raise HTTPException(status_code=422, detail="No questions found in file")

    user_id = await _get_user_id(db, current_user)
    created = []
    errors: list[str] = []
    for i, item in enumerate(parsed):
        qt = item.get("question_text", "").strip()
        if not qt:
            errors.append(f"Row {i + 1}: missing question_text")
            continue
        tags = item.get("topic_tags")
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        q = InterviewQuestion(
            user_id=user_id,
            question_text=qt,
            company=item.get("company"),
            role_title=item.get("role_title"),
            interview_stage=item.get("interview_stage"),
            interview_format=item.get("interview_format"),
            date_asked=item.get("date_asked"),
            topic_tags=tags if tags else None,
            notes=item.get("notes"),
            model_answer=item.get("model_answer"),
            outcome=item.get("outcome"),
        )
        db.add(q)
        created.append(q)

    await db.commit()
    for q in created:
        await db.refresh(q)

    return FileImportResult(
        questions=created,
        imported_count=len(created),
        errors=errors if errors else None,
    )


@router.post(
    "/transcribe",
    response_model=TranscribeResult,
    dependencies=[Depends(require_permission("interview_questions", "create"))],
)
async def transcribe(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB)")

    from app.services.transcription_service import transcribe_recording
    from app.services.question_parser_service import parse_questions_from_transcript

    try:
        transcript = await transcribe_recording(contents, file.filename)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        parsed = await parse_questions_from_transcript(transcript)
    except Exception:
        logger.exception("Failed to parse transcript into questions")
        parsed = [{"question_text": transcript[:500], "notes": "AI could not parse structured questions"}]

    return TranscribeResult(transcript=transcript, parsed_questions=parsed)


@router.post(
    "/bulk-create",
    response_model=list[InterviewQuestionOut],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("interview_questions", "create"))],
)
async def bulk_create(
    body: BulkCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    if not body.questions:
        raise HTTPException(status_code=400, detail="No questions provided")
    user_id = await _get_user_id(db, current_user)
    created = []
    for item in body.questions:
        q = InterviewQuestion(
            user_id=user_id,
            question_text=item.question_text,
            company=item.company,
            role_title=item.role_title,
            interview_stage=item.interview_stage,
            interview_format=item.interview_format,
            date_asked=item.date_asked,
            topic_tags=item.topic_tags,
            linked_story_ids=[str(sid) for sid in item.linked_story_ids]
            if item.linked_story_ids else None,
            notes=item.notes,
            model_answer=item.model_answer,
            outcome=item.outcome,
            source_job_id=item.source_job_id,
        )
        db.add(q)
        created.append(q)
    await db.commit()
    for q in created:
        await db.refresh(q)
    return created


@router.get(
    "/{question_id}",
    response_model=InterviewQuestionOut,
    dependencies=[Depends(require_permission("interview_questions", "view"))],
)
async def get_question(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    return await _get_owned(db, user_id, question_id)


@router.post(
    "",
    response_model=InterviewQuestionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("interview_questions", "create"))],
)
async def create_question(
    body: InterviewQuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    q = InterviewQuestion(
        user_id=user_id,
        question_text=body.question_text,
        company=body.company,
        role_title=body.role_title,
        interview_stage=body.interview_stage,
        interview_format=body.interview_format,
        date_asked=body.date_asked,
        topic_tags=body.topic_tags,
        linked_story_ids=[str(sid) for sid in body.linked_story_ids]
        if body.linked_story_ids else None,
        notes=body.notes,
        model_answer=body.model_answer,
        outcome=body.outcome,
        source_job_id=body.source_job_id,
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q


@router.patch(
    "/{question_id}",
    response_model=InterviewQuestionOut,
    dependencies=[Depends(require_permission("interview_questions", "edit"))],
)
async def update_question(
    question_id: uuid.UUID,
    body: InterviewQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    q = await _get_owned(db, user_id, question_id)
    data = body.model_dump(exclude_unset=True)
    if "linked_story_ids" in data and data["linked_story_ids"] is not None:
        data["linked_story_ids"] = [str(sid) for sid in data["linked_story_ids"]]
    for field, value in data.items():
        setattr(q, field, value)
    await db.commit()
    await db.refresh(q)
    return q


@router.delete(
    "/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("interview_questions", "delete"))],
)
async def delete_question(
    question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    q = await _get_owned(db, user_id, question_id)
    await db.delete(q)
    await db.commit()
