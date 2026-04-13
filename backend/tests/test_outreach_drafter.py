"""Direct Outreach Drafter tests -- helper functions and artifact lookup."""

from unittest.mock import MagicMock

from app.services.agents.outreach_drafter import (
    _get_company_brief,
    _get_ninety_day_plan,
    _get_tailored_resume,
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
    ctx = _make_context([_make_artifact("company_brief", "Acme overview")])
    assert _get_company_brief(ctx) == "Acme overview"


def test_get_company_brief_missing():
    ctx = _make_context([])
    assert _get_company_brief(ctx) == ""


def test_get_ninety_day_plan_found():
    ctx = _make_context([
        _make_artifact("ninety_day_plan", "Week 1-2: Learn..."),
    ])
    assert _get_ninety_day_plan(ctx) == "Week 1-2: Learn..."


def test_get_ninety_day_plan_missing():
    ctx = _make_context([_make_artifact("company_brief", "brief")])
    assert _get_ninety_day_plan(ctx) == ""


def test_get_tailored_resume_prefers_amplified():
    """Amplified resume takes priority over ageism-scrubbed and tailored."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
        _make_artifact("ageism_scrubbed_resume", "scrubbed"),
        _make_artifact("amplified_resume", "amplified"),
    ])
    assert _get_tailored_resume(ctx) == "amplified"


def test_get_tailored_resume_falls_back_to_ageism_scrubbed():
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
        _make_artifact("ageism_scrubbed_resume", "scrubbed"),
    ])
    assert _get_tailored_resume(ctx) == "scrubbed"


def test_get_tailored_resume_falls_back_to_tailored():
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
    ])
    assert _get_tailored_resume(ctx) == "original"


def test_get_tailored_resume_returns_empty_when_none():
    ctx = _make_context([_make_artifact("company_brief", "brief")])
    assert _get_tailored_resume(ctx) == ""
