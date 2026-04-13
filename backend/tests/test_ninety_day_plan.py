"""90-Day Plan Generator tests -- helper functions and artifact lookup."""

from unittest.mock import MagicMock

from app.services.agents.ninety_day_plan import (
    _get_company_brief,
    _get_culture_analysis,
    _get_skill_gap_report,
)


def _make_artifact(artifact_type: str, content: str = "test") -> MagicMock:
    art = MagicMock()
    art.artifact_type = artifact_type
    art.content = content
    return art


def _make_context(artifacts: list) -> MagicMock:
    ctx = MagicMock()
    ctx.workspace_artifacts = artifacts
    return ctx


def test_get_company_brief_found():
    ctx = _make_context([
        _make_artifact("company_brief", "Acme overview"),
        _make_artifact("culture_analysis", "Culture stuff"),
    ])
    assert _get_company_brief(ctx) == "Acme overview"


def test_get_company_brief_missing():
    ctx = _make_context([_make_artifact("tailored_resume", "resume")])
    assert _get_company_brief(ctx) == ""


def test_get_culture_analysis_found():
    ctx = _make_context([
        _make_artifact("culture_analysis", "Values-driven culture"),
    ])
    assert _get_culture_analysis(ctx) == "Values-driven culture"


def test_get_culture_analysis_missing():
    ctx = _make_context([])
    assert _get_culture_analysis(ctx) == ""


def test_get_skill_gap_report_found():
    ctx = _make_context([
        _make_artifact("skill_gap_report", "Missing Python, AWS"),
    ])
    assert _get_skill_gap_report(ctx) == "Missing Python, AWS"


def test_get_skill_gap_report_missing():
    ctx = _make_context([_make_artifact("company_brief", "brief")])
    assert _get_skill_gap_report(ctx) == ""
