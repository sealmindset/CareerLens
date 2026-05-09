import asyncio
import logging
import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.database import async_session
from app.routers.translation_coach import compute_drift_score

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview-practice", tags=["interview-practice"])

_jobs: dict[str, dict] = {}


class SubmitRequest(BaseModel):
    question: str
    answer: str
    job_description: str | None = None


class SubmitResponse(BaseModel):
    job_id: str
    status: str = "pending"


class ResultResponse(BaseModel):
    status: str
    result: dict | None = None
    error: str | None = None


async def _score_job(job_id: str, question: str, answer: str, job_description: str | None):
    from app.ai.agent_service import score_translation_attempt

    try:
        async with async_session() as db:
            ai_result = await score_translation_attempt(db, question, answer, job_description)

        breakdown = {
            "led_with_problem": bool(ai_result.get("led_with_problem")),
            "business_outcome_present": bool(ai_result.get("business_outcome_present")),
            "jargon_translated": bool(ai_result.get("jargon_translated")),
            "used_employers_language": bool(ai_result.get("used_employers_language")),
            "quantified_impact": bool(ai_result.get("quantified_impact")),
        }
        drift_score, signal = compute_drift_score(breakdown)

        _jobs[job_id] = {
            "status": "complete",
            "result": {
                "drift_score": drift_score,
                "signal": signal,
                "scoring_breakdown": breakdown,
                "flagged_phrases": ai_result.get("flagged_phrases", []),
                "coaching_note": ai_result.get("coaching_note"),
                "translated_version": ai_result.get("translated_version"),
            },
        }
    except Exception as e:
        logger.error("Interview practice scoring failed for job %s: %s", job_id, e)
        _jobs[job_id] = {"status": "failed", "error": str(e)}


@router.post("/submit", response_model=SubmitResponse)
async def submit_answer(body: SubmitRequest):
    if not body.answer.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer cannot be empty")
    if not body.question.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question cannot be empty")

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "pending"}

    asyncio.create_task(_score_job(job_id, body.question, body.answer, body.job_description))

    return SubmitResponse(job_id=job_id)


@router.get("/result/{job_id}", response_model=ResultResponse)
async def get_result(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    return ResultResponse(
        status=job["status"],
        result=job.get("result"),
        error=job.get("error"),
    )
