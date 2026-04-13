"""AI Safety Testing admin endpoint."""

from fastapi import APIRouter, Depends

from app.middleware.permissions import require_permission
from app.services.ai_safety_test import run_safety_suite

router = APIRouter(
    prefix="/api/admin/ai-safety",
    tags=["ai-safety"],
    dependencies=[Depends(require_permission("app_settings", "view"))],
)


@router.get("/test")
async def run_safety_tests():
    """Run the full NeMo Guardrails safety test suite.

    Returns structured results with per-category breakdowns.
    """
    report = run_safety_suite()
    return {
        "total_tests": report.total_tests,
        "passed": report.passed,
        "failed": report.failed,
        "score": report.score,
        "results": report.results,
        "summary_by_category": report.summary_by_category,
    }
