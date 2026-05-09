import json
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.translation_coach import (
    TranslationAttempt,
    TranslationQuestion,
    TranslationSession,
)
from app.models.user import User
from app.schemas.auth import UserInfo
from app.schemas.translation_coach import (
    AttemptCreate,
    AttemptOut,
    QuestionOut,
    SessionCreate,
    SessionListItem,
    SessionOut,
    TrendData,
    TTSRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/translation-coach", tags=["translation-coach"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


def compute_drift_score(breakdown: dict) -> tuple[float, str]:
    score = (
        float(breakdown.get("led_with_problem", False)) * 0.25
        + float(breakdown.get("business_outcome_present", False)) * 0.25
        + float(breakdown.get("jargon_translated", False)) * 0.20
        + float(breakdown.get("used_employers_language", False)) * 0.15
        + float(breakdown.get("quantified_impact", False)) * 0.15
    )
    if score >= 0.75:
        signal = "green"
    elif score >= 0.45:
        signal = "amber"
    else:
        signal = "red"
    return round(score, 4), signal


def _validate_flagged_indices(flagged: list[dict], original: str) -> list[dict]:
    validated = []
    for phrase in flagged:
        orig_text = phrase.get("original", "")
        start = phrase.get("start_idx", -1)
        end = phrase.get("end_idx", -1)
        suggested = phrase.get("suggested", "")

        if start >= 0 and end > start and original[start:end] == orig_text:
            validated.append(phrase)
        else:
            idx = original.find(orig_text)
            if idx >= 0:
                validated.append({
                    "original": orig_text,
                    "suggested": suggested,
                    "start_idx": idx,
                    "end_idx": idx + len(orig_text),
                })
            else:
                validated.append({
                    "original": orig_text,
                    "suggested": suggested,
                    "start_idx": -1,
                    "end_idx": -1,
                })
    return validated


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------


@router.get(
    "/questions",
    response_model=list[QuestionOut],
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def list_questions(
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    query = select(TranslationQuestion).where(TranslationQuestion.is_active == True)
    if category:
        query = query.where(TranslationQuestion.category == category)
    query = query.order_by(TranslationQuestion.sort_order)
    result = await db.execute(query)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


@router.post(
    "/sessions",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    session = TranslationSession(user_id=user_id, job_description=body.job_description)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    await db.commit()
    return session


@router.get(
    "/sessions",
    response_model=list[SessionListItem],
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(TranslationSession)
        .where(TranslationSession.user_id == user_id)
        .order_by(TranslationSession.started_at.desc())
    )
    return result.scalars().all()


@router.get(
    "/sessions/{session_id}",
    response_model=SessionOut,
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    session = await db.get(TranslationSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    session = await db.get(TranslationSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    await db.delete(session)
    await db.commit()


@router.put(
    "/sessions/{session_id}/complete",
    response_model=SessionOut,
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def complete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)
    session = await db.get(TranslationSession, session_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    result = await db.execute(
        select(func.avg(TranslationAttempt.drift_score))
        .where(TranslationAttempt.session_id == session_id)
    )
    avg_score = result.scalar()

    session.avg_drift_score = round(avg_score, 4) if avg_score is not None else None
    session.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(session)
    await db.commit()
    return session


# ---------------------------------------------------------------------------
# Attempts (core scoring endpoint)
# ---------------------------------------------------------------------------


@router.post(
    "/attempts",
    response_model=AttemptOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def create_attempt(
    body: AttemptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)

    session = await db.get(TranslationSession, uuid.UUID(body.session_id))
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if not body.original_answer.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer cannot be empty")

    # Resolve question text
    question_text = body.custom_question
    question_id = None
    if body.question_id:
        question_id = uuid.UUID(body.question_id)
        q = await db.get(TranslationQuestion, question_id)
        if q:
            question_text = q.question_text

    if not question_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No question provided")

    # Call AI for scoring
    from app.ai.agent_service import score_translation_attempt

    try:
        ai_result = await score_translation_attempt(
            db, question_text, body.original_answer, session.job_description
        )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned invalid JSON — please try again",
        )
    except Exception as e:
        logger.error("Translation scoring failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI scoring failed — please try again",
        )

    breakdown = {
        "led_with_problem": bool(ai_result.get("led_with_problem")),
        "business_outcome_present": bool(ai_result.get("business_outcome_present")),
        "jargon_translated": bool(ai_result.get("jargon_translated")),
        "used_employers_language": bool(ai_result.get("used_employers_language")),
        "quantified_impact": bool(ai_result.get("quantified_impact")),
    }
    drift_score, signal = compute_drift_score(breakdown)

    flagged = ai_result.get("flagged_phrases", []) or []
    if isinstance(flagged, list):
        flagged = _validate_flagged_indices(flagged, body.original_answer)

    attempt = TranslationAttempt(
        session_id=session.id,
        user_id=user_id,
        question_id=question_id,
        custom_question=body.custom_question,
        original_answer=body.original_answer,
        drift_score=drift_score,
        signal=signal,
        scoring_breakdown=breakdown,
        flagged_phrases=flagged,
        translated_version=ai_result.get("translated_version"),
        coaching_note=ai_result.get("coaching_note"),
    )
    db.add(attempt)

    session.question_count += 1
    await db.flush()
    await db.refresh(attempt)
    await db.commit()
    return attempt


# ---------------------------------------------------------------------------
# History / Trends
# ---------------------------------------------------------------------------


@router.get(
    "/history",
    response_model=TrendData,
    dependencies=[Depends(require_permission("translation_coach", "view"))],
)
async def get_history(
    db: AsyncSession = Depends(get_db),
    current_user: UserInfo = Depends(get_current_user),
):
    user_id = await _get_user_id(db, current_user)

    result = await db.execute(
        select(TranslationSession)
        .where(TranslationSession.user_id == user_id)
        .order_by(TranslationSession.started_at.asc())
    )
    sessions = list(result.scalars().all())

    count_result = await db.execute(
        select(func.count(TranslationAttempt.id))
        .where(TranslationAttempt.user_id == user_id)
    )
    total_attempts = count_result.scalar() or 0

    completed = [s for s in sessions if s.avg_drift_score is not None]
    overall_avg = None
    improvement_pct = None
    if completed:
        overall_avg = round(sum(s.avg_drift_score for s in completed) / len(completed), 4)
        if len(completed) >= 6:
            first_3 = sum(s.avg_drift_score for s in completed[:3]) / 3
            last_3 = sum(s.avg_drift_score for s in completed[-3:]) / 3
            if first_3 > 0:
                improvement_pct = round((last_3 - first_3) / first_3 * 100, 1)

    return TrendData(
        sessions=[SessionListItem.model_validate(s) for s in sessions],
        overall_avg=overall_avg,
        total_attempts=total_attempts,
        improvement_pct=improvement_pct,
    )


# ---------------------------------------------------------------------------
# TTS Proxy
# ---------------------------------------------------------------------------


@router.post(
    "/tts",
    dependencies=[Depends(require_permission("translation_coach", "use"))],
)
async def synthesize_tts(
    body: TTSRequest,
    current_user: UserInfo = Depends(get_current_user),
):
    kokoro_url = getattr(settings, "KOKORO_TTS_URL", "http://kokoro-tts:8880")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{kokoro_url}/v1/audio/speech",
                json={
                    "model": "kokoro",
                    "input": body.text,
                    "voice": body.voice or "af_bella",
                    "response_format": "wav",
                },
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=503, detail="TTS unavailable")
            return Response(content=resp.content, media_type="audio/wav")
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="TTS service unreachable")
