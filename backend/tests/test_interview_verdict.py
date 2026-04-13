"""Interview Verdict tests -- helper functions and JSON extraction."""

import json
from unittest.mock import MagicMock

from app.services.agents.interview_verdict import (
    VOTING_AGENTS,
    FALLBACK_JSON,
    _count_available_evaluative_artifacts,
    _extract_json,
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


def test_count_available_evaluative_artifacts_all_present():
    """All 6 voting agent artifacts present."""
    ctx = _make_context([
        _make_artifact("job_match_analysis"),
        _make_artifact("ats_score"),
        _make_artifact("hiring_manager_review"),
        _make_artifact("interview_prep_guide"),
        _make_artifact("application_strategy"),
        _make_artifact("culture_analysis"),
        _make_artifact("tailored_resume"),  # non-voting
    ])
    assert _count_available_evaluative_artifacts(ctx) == 6


def test_count_available_evaluative_artifacts_partial():
    """Only 2 voting artifacts present."""
    ctx = _make_context([
        _make_artifact("job_match_analysis"),
        _make_artifact("ats_score"),
        _make_artifact("tailored_resume"),
    ])
    assert _count_available_evaluative_artifacts(ctx) == 2


def test_count_available_evaluative_artifacts_none():
    """No evaluative artifacts, only non-voting ones."""
    ctx = _make_context([
        _make_artifact("tailored_resume"),
        _make_artifact("amplified_resume"),
        _make_artifact("ninety_day_plan"),
    ])
    assert _count_available_evaluative_artifacts(ctx) == 0


def test_extract_json_from_code_block():
    """JSON wrapped in ```json ... ``` code fences."""
    raw = '```json\n{"verdicts": [], "captain": {}, "summary": {}}\n```'
    result = _extract_json(raw)
    parsed = json.loads(result)
    assert "verdicts" in parsed


def test_extract_json_from_raw():
    """Raw JSON with no code fences."""
    raw = '{"verdicts": [{"agent": "scout"}], "captain": {"decision": "INTERVIEW"}, "summary": {}}'
    result = _extract_json(raw)
    parsed = json.loads(result)
    assert parsed["verdicts"][0]["agent"] == "scout"


def test_extract_json_fallback_on_invalid():
    """Invalid input falls back to FALLBACK_JSON."""
    result = _extract_json("This is not JSON at all, just plain text.")
    parsed = json.loads(result)
    assert parsed["captain"]["decision"] == "INSUFFICIENT_DATA"
    assert result == FALLBACK_JSON


def test_voting_agents_configuration():
    """VOTING_AGENTS has 6 entries with required keys."""
    assert len(VOTING_AGENTS) == 6
    for va in VOTING_AGENTS:
        assert "agent" in va
        assert "artifact_type" in va
        assert "label" in va
