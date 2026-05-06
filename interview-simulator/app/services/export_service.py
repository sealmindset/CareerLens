import logging
import uuid

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.debrief import InterviewSimDebrief
from app.models.session import InterviewSimSession

logger = logging.getLogger(__name__)


async def export_debrief_to_workspace(
    db: AsyncSession,
    session: InterviewSimSession,
    debrief: InterviewSimDebrief,
) -> dict | None:
    if not session.application_id:
        return None

    content = _build_export_markdown(session, debrief)
    internal_headers = {
        "X-Internal-Service": "interview-simulator",
        "X-Internal-Secret": settings.JWT_SECRET,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            art_resp = await client.post(
                f"{settings.CAREERLENS_BACKEND_URL}/api/internal/artifacts",
                json={
                    "user_id": str(session.user_id),
                    "application_id": str(session.application_id),
                    "agent_name": "interview_simulator",
                    "artifact_type": "interview_sim_debrief",
                    "title": f"Voice Interview Debrief - {session.job_title} at {session.company}",
                    "content": content,
                    "content_format": "markdown",
                },
                headers=internal_headers,
            )
            if art_resp.status_code == 404:
                logger.warning("No workspace found for application %s", session.application_id)
                return None
            art_resp.raise_for_status()
            art_data = art_resp.json()

            debrief.exported_to_workspace = True
            debrief.workspace_artifact_id = uuid.UUID(art_data["artifact_id"])

            journal_resp = await client.post(
                f"{settings.CAREERLENS_BACKEND_URL}/api/internal/journal",
                json={
                    "user_id": str(session.user_id),
                    "application_id": str(session.application_id),
                    "entry_type": "voice_sim",
                    "title": f"Voice Interview Practice - {session.interview_style.title()}",
                    "content": _build_journal_summary(session, debrief),
                    "outcome": _score_to_outcome(debrief.overall_score),
                },
                headers=internal_headers,
            )
            journal_id = None
            if journal_resp.status_code == 200:
                journal_id = journal_resp.json().get("entry_id")

            await db.commit()
            return {
                "exported": True,
                "workspace_id": str(art_data["workspace_id"]),
                "artifact_id": str(art_data["artifact_id"]),
                "journal_entry_id": journal_id,
            }
    except Exception as exc:
        logger.error("Export to workspace failed: %s", exc)
        return None


def _build_export_markdown(session: InterviewSimSession, debrief: InterviewSimDebrief) -> str:
    extra = ""
    if debrief.story_utilization:
        extra += f"\n## Story Utilization\n\n{debrief.story_utilization}\n"
    if debrief.gap_correlation:
        extra += f"\n## Gap Correlation\n\n{debrief.gap_correlation}\n"

    return f"""# Voice Interview Simulator — Debrief

**Role:** {session.job_title} at {session.company}
**Style:** {session.interview_style}
**Date:** {session.completed_at or session.created_at}

## Scores

| Dimension | Score |
|-----------|-------|
| Overall | {debrief.overall_score}/100 |
| Clarity | {debrief.clarity_score}/100 |
| Specificity | {debrief.specificity_score}/100 |
| Confidence | {debrief.confidence_score}/100 |
| Structure | {debrief.structure_score}/100 |
| Conciseness | {debrief.conciseness_score}/100 |

## What Landed

{debrief.what_landed or 'N/A'}

## What Missed

{debrief.what_missed or 'N/A'}

## Portfolio Gaps

{debrief.portfolio_gaps or 'N/A'}

## Improvement Plan

{debrief.improvement_plan or 'N/A'}
{extra}"""


def _build_journal_summary(session: InterviewSimSession, debrief: InterviewSimDebrief) -> str:
    return (
        f"Completed {session.interview_style} voice interview practice for "
        f"{session.job_title} at {session.company}.\n\n"
        f"**Overall Score:** {debrief.overall_score}/100\n"
        f"Clarity: {debrief.clarity_score} | Specificity: {debrief.specificity_score} | "
        f"Confidence: {debrief.confidence_score} | Structure: {debrief.structure_score} | "
        f"Conciseness: {debrief.conciseness_score}"
    )


def _score_to_outcome(score: int | None) -> str:
    if score is None:
        return "needs_work"
    if score >= 80:
        return "strong"
    if score >= 60:
        return "moderate"
    return "needs_work"
