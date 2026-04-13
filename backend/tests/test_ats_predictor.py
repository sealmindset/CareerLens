"""ATS Predictor tests -- resume fallback priority logic."""

from unittest.mock import MagicMock

from app.services.agents.ats_predictor import _get_best_resume_content


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
        _make_artifact("ageism_scrubbed_resume", "scrubbed"),
        _make_artifact("amplified_resume", "amplified"),
    ])
    assert _get_best_resume_content(ctx) == "amplified"


def test_get_best_resume_falls_back_to_ageism_scrubbed():
    """When no amplified resume, prefer ageism_scrubbed."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
        _make_artifact("ageism_scrubbed_resume", "scrubbed"),
    ])
    assert _get_best_resume_content(ctx) == "scrubbed"


def test_get_best_resume_falls_back_to_tailored():
    """When only tailored resume exists, use it."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
        _make_artifact("keyword_optimization", "keywords"),
    ])
    assert _get_best_resume_content(ctx) == "original"


def test_get_best_resume_returns_empty_when_none():
    """When no resume artifacts exist, return empty string."""
    ctx = _make_context([_make_artifact("keyword_optimization", "keywords")])
    assert _get_best_resume_content(ctx) == ""
