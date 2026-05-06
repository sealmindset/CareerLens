import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_ws_user
from app.db import async_session
from app.models.question import InterviewSimQuestion
from app.models.response import InterviewSimResponse
from app.models.session import InterviewSimSession
from app.services.debrief_generator import generate_debrief
from app.services.export_service import export_debrief_to_workspace
from app.services.nudge_engine import analyze_response, get_nudge_text, get_nudge_type
from app.services.response_evaluator import evaluate_response
from app.services.tts_service import synthesize_speech

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/api/sim/sessions/{session_id}/live")
async def live_interview(websocket: WebSocket, session_id: uuid.UUID):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        user = await get_ws_user(token)
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()
    logger.info("WebSocket connected for session %s", session_id)

    async with async_session() as db:
        user_id = uuid.UUID(user["user_id"])
        session = await db.get(InterviewSimSession, session_id)
        if not session or session.user_id != user_id:
            await websocket.send_json({"type": "error", "message": "Session not found"})
            await websocket.close(code=4004)
            return

        if session.status not in ("ready", "active"):
            await websocket.send_json({"type": "error", "message": f"Session not ready (status: {session.status})"})
            await websocket.close(code=4004)
            return

        questions = (
            await db.execute(
                select(InterviewSimQuestion)
                .where(InterviewSimQuestion.session_id == session_id)
                .order_by(InterviewSimQuestion.question_index)
            )
        ).scalars().all()

        if not questions:
            await websocket.send_json({"type": "error", "message": "No questions generated"})
            await websocket.close(code=4004)
            return

        # Mark session as active
        session.status = "active"
        session.started_at = datetime.now(timezone.utc)
        await db.commit()

        await websocket.send_json({
            "type": "session_started",
            "total_questions": len(questions),
            "interview_style": session.interview_style,
        })

        try:
            await _run_interview_loop(websocket, db, session, questions)
        except WebSocketDisconnect:
            logger.info("Client disconnected from session %s", session_id)
            session.status = "abandoned"
            await db.commit()
        except Exception as exc:
            logger.error("Interview loop error: %s", exc, exc_info=True)
            session.status = "abandoned"
            await db.commit()
            try:
                await websocket.send_json({"type": "error", "message": "Internal error"})
            except Exception:
                pass


async def _run_interview_loop(
    websocket: WebSocket,
    db: AsyncSession,
    session: InterviewSimSession,
    questions: list[InterviewSimQuestion],
):
    for i, question in enumerate(questions):
        # Generate TTS audio
        audio_filename = None
        audio_path = await synthesize_speech(
            question.question_text,
            interview_style=session.interview_style,
        )
        if audio_path:
            audio_filename = audio_path.split("/")[-1]

        # Send question to client
        await websocket.send_json({
            "type": "question",
            "index": question.question_index,
            "total": len(questions),
            "text": question.question_text,
            "question_type": question.question_type,
            "audio_url": f"/api/sim/audio/{audio_filename}" if audio_filename else None,
        })

        # Wait for response from client
        response_data = await _collect_response(websocket, db, session, question)

        if response_data is None:
            # User skipped or session ended
            continue

        # Send partial evaluation feedback
        await websocket.send_json({
            "type": "evaluation_partial",
            "question_index": question.question_index,
            "filler_count": response_data.get("filler_word_count", 0),
            "pace_wpm": response_data.get("pace_wpm"),
            "confidence_score": response_data.get("confidence_score"),
        })

    # Session complete
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    await db.commit()

    # Generate debrief
    await websocket.send_json({"type": "generating_debrief"})
    try:
        debrief = await generate_debrief(db, session.id)

        artifact_id = None
        if session.application_id:
            export_result = await export_debrief_to_workspace(db, session, debrief)
            if export_result:
                artifact_id = export_result.get("artifact_id")

        await websocket.send_json({
            "type": "session_complete",
            "debrief_id": str(debrief.id),
            "overall_score": debrief.overall_score,
            "artifact_id": artifact_id,
            "exported": artifact_id is not None,
        })
    except Exception as exc:
        logger.error("Debrief generation failed: %s", exc)
        await websocket.send_json({
            "type": "session_complete",
            "debrief_id": None,
            "overall_score": None,
            "artifact_id": None,
            "exported": False,
            "error": "Debrief generation failed",
        })


async def _collect_response(
    websocket: WebSocket,
    db: AsyncSession,
    session: InterviewSimSession,
    question: InterviewSimQuestion,
) -> dict | None:
    transcript_parts: list[str] = []
    silence_gaps: list[dict] = []
    vad_events: list[dict] = []
    response_start_ms: int | None = None
    last_speech_ms: int = 0
    was_nudged = False
    was_interrupted = False
    current_silence_ms = 0

    while True:
        try:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
        except WebSocketDisconnect:
            raise
        except Exception:
            continue

        msg_type = msg.get("type")

        if msg_type == "transcript_interim":
            # Real-time interim transcript — just for display
            current_silence_ms = 0
            continue

        elif msg_type == "transcript_final":
            text = msg.get("text", "").strip()
            if text:
                transcript_parts.append(text)
            timestamp_ms = msg.get("timestamp_ms", 0)
            if response_start_ms is None:
                response_start_ms = timestamp_ms
            last_speech_ms = timestamp_ms
            current_silence_ms = 0

        elif msg_type == "silence_detected":
            duration_ms = msg.get("duration_ms", 0)
            current_silence_ms = duration_ms
            silence_gaps.append({
                "start_ms": last_speech_ms,
                "duration_ms": duration_ms,
            })

            # Check if nudge needed
            transcript_so_far = " ".join(transcript_parts)
            analysis = analyze_response(transcript_so_far, max(last_speech_ms - (response_start_ms or 0), 1))
            nudge_type = get_nudge_type(
                silence_ms=duration_ms,
                filler_density=analysis["filler_density"],
                trailing_count=analysis["trailing_off_count"],
                response_duration_s=max(last_speech_ms - (response_start_ms or 0), 1) // 1000,
                ramble_threshold_s=session.question_count * 12,
            )

            if nudge_type:
                nudge_text = get_nudge_text(nudge_type)
                nudge_audio = await synthesize_speech(nudge_text, session.interview_style)
                nudge_filename = nudge_audio.split("/")[-1] if nudge_audio else None
                await websocket.send_json({
                    "type": "nudge",
                    "nudge_type": nudge_type,
                    "text": nudge_text,
                    "audio_url": f"/api/sim/audio/{nudge_filename}" if nudge_filename else None,
                })
                was_nudged = True

            # Auto-skip on very long silence
            if duration_ms > 15000 and not transcript_parts:
                await websocket.send_json({"type": "question_skipped", "reason": "silence"})
                return None

        elif msg_type == "interrupt":
            was_interrupted = True
            logger.info(
                "User interrupted question %d: spoken=%d chars, remaining=%d chars",
                question.question_index,
                len(msg.get("spoken_text", "")),
                len(msg.get("remaining_text", "")),
            )
            await websocket.send_json({"type": "interrupt_ack", "action": "continue"})

        elif msg_type == "vad_event":
            vad_events.append({
                "event": msg.get("event"),
                "timestamp_ms": msg.get("timestamp_ms", 0),
                "duration_ms": msg.get("duration_ms"),
            })

        elif msg_type == "response_complete":
            break

        elif msg_type == "skip_question":
            return None

        elif msg_type == "end_session":
            return None

    full_transcript = " ".join(transcript_parts)
    if not full_transcript.strip():
        return None

    duration_ms = (last_speech_ms - (response_start_ms or 0)) if response_start_ms else 0

    # Evaluate response
    eval_result = await evaluate_response(
        question_text=question.question_text,
        transcript=full_transcript,
        duration_ms=max(duration_ms, 1),
        expected_signals=question.expected_signals,
    )

    # Save response
    response = InterviewSimResponse(
        question_id=question.id,
        session_id=session.id,
        transcript=full_transcript,
        duration_ms=duration_ms,
        filler_word_count=eval_result.get("filler_word_count", 0),
        filler_words=eval_result.get("filler_words"),
        silence_gaps=silence_gaps if silence_gaps else None,
        pace_wpm=eval_result.get("pace_wpm"),
        clarity_score=eval_result.get("clarity_score"),
        specificity_score=eval_result.get("specificity_score"),
        confidence_score=eval_result.get("confidence_score"),
        structure_score=eval_result.get("structure_score"),
        example_quality=eval_result.get("example_quality"),
        evaluator_notes=eval_result.get("evaluator_notes"),
        stalled=eval_result.get("stalled", False),
        was_nudged=was_nudged,
        trailing_off_count=eval_result.get("trailing_off_count", 0),
    )
    db.add(response)
    await db.commit()

    return eval_result
