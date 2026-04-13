"""Achievement Amplifier tests -- resume fallback logic and Story Bank context."""

from unittest.mock import MagicMock

from app.services.agents.achievement_amplifier import (
    _format_story_bank_context,
    _get_best_resume_content,
    MAX_STORY_CONTEXT_ENTRIES,
)


def _make_artifact(artifact_type: str, content: str = "test") -> MagicMock:
    art = MagicMock()
    art.artifact_type = artifact_type
    art.content = content
    return art


def _make_story(
    title: str = "Test Story",
    company: str = "TestCorp",
    role: str = "Engineer",
    proof_metric: str | None = None,
    deployed: str = "Shipped the feature.",
) -> MagicMock:
    story = MagicMock()
    story.story_title = title
    story.source_company = company
    story.source_title = role
    story.proof_metric = proof_metric
    story.deployed = deployed
    return story


def _make_context(artifacts: list) -> MagicMock:
    ctx = MagicMock()
    ctx.workspace_artifacts = artifacts
    return ctx


def test_get_best_resume_prefers_ageism_scrubbed():
    """Ageism-scrubbed resume should take priority over tailored."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
        _make_artifact("ageism_scrubbed_resume", "scrubbed"),
    ])
    assert _get_best_resume_content(ctx) == "scrubbed"


def test_get_best_resume_falls_back_to_tailored():
    """When no ageism-scrubbed resume exists, use tailored."""
    ctx = _make_context([
        _make_artifact("tailored_resume", "original"),
        _make_artifact("keyword_optimization", "keywords"),
    ])
    assert _get_best_resume_content(ctx) == "original"


def test_get_best_resume_returns_empty_when_none():
    """When no resume artifacts exist, return empty string."""
    ctx = _make_context([_make_artifact("keyword_optimization", "keywords")])
    assert _get_best_resume_content(ctx) == ""


def test_format_story_bank_context_empty():
    """Empty story list should return empty string."""
    assert _format_story_bank_context([]) == ""


def test_format_story_bank_context_with_stories():
    """Stories should be formatted with proof metrics and verified results."""
    stories = [
        _make_story(
            title="Built API Gateway",
            company="Acme",
            role="Senior Engineer",
            proof_metric="Reduced latency by 60%",
            deployed="Deployed to production serving 10M requests/day.",
        )
    ]
    result = _format_story_bank_context(stories)
    assert "Verified Facts from Story Bank" in result
    assert "Senior Engineer at Acme" in result
    assert "Reduced latency by 60%" in result
    assert "10M requests/day" in result


def test_format_story_bank_context_caps_at_max():
    """Story context should be capped at MAX_STORY_CONTEXT_ENTRIES."""
    stories = [_make_story(title=f"Story {i}") for i in range(20)]
    result = _format_story_bank_context(stories)
    # Count story entries (each starts with **Engineer at TestCorp**)
    entries = result.count("**Engineer at TestCorp**")
    assert entries == MAX_STORY_CONTEXT_ENTRIES


def test_format_story_bank_context_handles_missing_fields():
    """Stories with None fields should still format gracefully."""
    story = _make_story(proof_metric=None, deployed="Result here.")
    result = _format_story_bank_context([story])
    assert "Verified Result:" in result
    assert "Verified Metric:" not in result
