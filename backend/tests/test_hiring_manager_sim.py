"""Hiring Manager Simulator tests -- resume fallback and ATS score retrieval."""

from unittest.mock import MagicMock

from app.services.agents.hiring_manager_sim import (
    _get_best_resume_content,
    _get_ats_score_content,
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


def test_get_best_resume_prefers_amplified():
    """Amplified resume should take highest priority."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
        _make_artifact("amplified_resume", "amplified"),
    ])
    assert _get_best_resume_content(ctx) == "amplified"


def test_get_best_resume_falls_back_to_tailored():
    """When only tailored resume exists, use it."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
    ])
    assert _get_best_resume_content(ctx) == "original"


def test_get_best_resume_returns_empty_when_none():
    """When no resume artifacts exist, return empty string."""
    ctx = _make_context([_make_artifact("ats_score", "score")])
    assert _get_best_resume_content(ctx) == ""


def test_get_ats_score_content_found():
    """Should locate and return ATS score artifact content."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "resume"),
        _make_artifact("ats_score", "Score: 85/100"),
    ])
    assert _get_ats_score_content(ctx) == "Score: 85/100"


def test_get_ats_score_content_missing():
    """When no ATS score artifact exists, return empty string."""
    ctx = _make_context([_make_artifact("tailored_resume", "resume")])
    assert _get_ats_score_content(ctx) == ""
