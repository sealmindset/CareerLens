import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.response_evaluator import _rule_clarity, evaluate_response


class TestRuleClarity:
    def test_clean_analysis_baseline(self):
        """Clean analysis with no issues should return 0.7 baseline."""
        analysis = {
            "filler_density": 0.0,
            "trailing_off_count": 0,
            "pace_wpm": 130,
        }
        assert _rule_clarity(analysis) == 0.7

    def test_high_filler_density_lowers_clarity(self):
        """Filler density above 0.1 should reduce clarity by 0.2."""
        analysis = {
            "filler_density": 0.15,
            "trailing_off_count": 0,
            "pace_wpm": 130,
        }
        score = _rule_clarity(analysis)
        assert score == pytest.approx(0.5)

    def test_high_trailing_off_lowers_clarity(self):
        """Trailing-off count above 2 should reduce clarity by 0.15."""
        analysis = {
            "filler_density": 0.0,
            "trailing_off_count": 4,
            "pace_wpm": 130,
        }
        score = _rule_clarity(analysis)
        assert score == pytest.approx(0.55)

    def test_extreme_pace_too_fast(self):
        """Pace above 200 wpm should reduce clarity by 0.1."""
        analysis = {
            "filler_density": 0.0,
            "trailing_off_count": 0,
            "pace_wpm": 250,
        }
        score = _rule_clarity(analysis)
        assert score == pytest.approx(0.6)

    def test_extreme_pace_too_slow(self):
        """Pace below 80 wpm should reduce clarity by 0.1."""
        analysis = {
            "filler_density": 0.0,
            "trailing_off_count": 0,
            "pace_wpm": 50,
        }
        score = _rule_clarity(analysis)
        assert score == pytest.approx(0.6)

    def test_normal_pace_no_penalty(self):
        """Pace between 80 and 200 should incur no penalty."""
        for pace in [80, 130, 200]:
            analysis = {
                "filler_density": 0.0,
                "trailing_off_count": 0,
                "pace_wpm": pace,
            }
            assert _rule_clarity(analysis) == 0.7

    def test_all_penalties_stacked(self):
        """All penalties combined should stack but not go below 0.0."""
        analysis = {
            "filler_density": 0.20,
            "trailing_off_count": 5,
            "pace_wpm": 40,
        }
        score = _rule_clarity(analysis)
        # 0.7 - 0.2 - 0.15 - 0.1 = 0.25
        assert score == pytest.approx(0.25)

    def test_floor_at_zero(self):
        """Score should never drop below 0.0 even with extreme penalties."""
        analysis = {
            "filler_density": 0.99,
            "trailing_off_count": 100,
            "pace_wpm": 10,
        }
        score = _rule_clarity(analysis)
        assert score >= 0.0

    def test_missing_pace_defaults_to_130(self):
        """Missing pace_wpm should default to 130 (no penalty)."""
        analysis = {
            "filler_density": 0.0,
            "trailing_off_count": 0,
        }
        score = _rule_clarity(analysis)
        assert score == 0.7


class TestEvaluateResponse:
    @pytest.mark.asyncio
    async def test_merged_output_has_rule_and_ai_scores(self):
        """When AI succeeds, merged output should include both rule-based and AI scores."""
        ai_json = json.dumps({
            "clarity": 0.85,
            "specificity": 0.9,
            "confidence": 0.8,
            "structure": 0.75,
            "example_quality": "compelling",
            "wrong_impression": [],
            "notes": "Clear and well-structured response with concrete metrics.",
        })

        with patch("app.services.response_evaluator.ai_complete", new_callable=AsyncMock, return_value=ai_json):
            result = await evaluate_response(
                question_text="Tell me about a time you led a project.",
                transcript="I led a team of five engineers to redesign our payment system. We achieved a 40 percent reduction in processing time.",
                duration_ms=30000,
                expected_signals=["leadership", "metrics"],
            )

        # AI scores present
        assert result["clarity_score"] == 0.85
        assert result["specificity_score"] == 0.9
        assert result["confidence_score"] == 0.8
        assert result["structure_score"] == 0.75
        assert result["example_quality"] == "compelling"
        assert result["evaluator_notes"] == "Clear and well-structured response with concrete metrics."

        # Rule-based fields always present
        assert "filler_words" in result
        assert "filler_word_count" in result
        assert "pace_wpm" in result
        assert "trailing_off_count" in result
        assert isinstance(result["stalled"], bool)

    @pytest.mark.asyncio
    async def test_stalled_flag_when_high_filler_density(self):
        """Stalled should be True when filler density exceeds 0.15."""
        ai_json = json.dumps({
            "clarity": 0.3,
            "specificity": 0.2,
            "confidence": 0.2,
            "structure": 0.1,
            "example_quality": "none",
            "notes": "Too many fillers.",
        })

        filler_transcript = "Um uh like you know basically um uh like sort of um uh"

        with patch("app.services.response_evaluator.ai_complete", new_callable=AsyncMock, return_value=ai_json):
            result = await evaluate_response(
                question_text="Describe your experience.",
                transcript=filler_transcript,
                duration_ms=10000,
            )

        assert result["stalled"] is True
        assert result["filler_word_count"] > 0


class TestEvaluateResponseAiFail:
    @pytest.mark.asyncio
    async def test_rule_based_fallback_on_ai_exception(self):
        """When AI raises an exception, rule-based fallback should still populate scores."""
        with patch(
            "app.services.response_evaluator.ai_complete",
            new_callable=AsyncMock,
            side_effect=Exception("AI provider unreachable"),
        ):
            result = await evaluate_response(
                question_text="Tell me about yourself.",
                transcript="I led a team of five engineers. We achieved great results. The impact was measurable.",
                duration_ms=20000,
            )

        # Rule-based fields populated
        assert "filler_words" in result
        assert "filler_word_count" in result
        assert "pace_wpm" in result
        assert result["pace_wpm"] > 0
        assert "trailing_off_count" in result

        # Clarity: 0.7 baseline minus 0.1 for pace < 80 WPM (15 words / 20s = 45 WPM)
        assert result["clarity_score"] == pytest.approx(0.6)

        # Defaults for AI-only fields
        assert result["specificity_score"] == 0.5
        assert result["structure_score"] == 0.5
        assert result["example_quality"] == "vague"
        assert result["evaluator_notes"] == ""

    @pytest.mark.asyncio
    async def test_confidence_fallback_uses_rule_analysis(self):
        """On AI failure, confidence_score should come from rule-based analysis."""
        with patch(
            "app.services.response_evaluator.ai_complete",
            new_callable=AsyncMock,
            side_effect=RuntimeError("All providers down"),
        ):
            result = await evaluate_response(
                question_text="What are your strengths?",
                transcript="Specifically, I led the initiative and we achieved record results. I delivered it on time.",
                duration_ms=15000,
            )

        # Positive confidence signals should produce a score above 0.5
        assert result["confidence_score"] > 0.5


class TestMergedScores:
    @pytest.mark.asyncio
    async def test_ai_scores_override_rule_based(self):
        """AI-provided scores should take precedence over rule-based calculations."""
        ai_json = json.dumps({
            "clarity": 0.95,
            "confidence": 0.92,
        })

        with patch("app.services.response_evaluator.ai_complete", new_callable=AsyncMock, return_value=ai_json):
            result = await evaluate_response(
                question_text="Describe a challenge you faced.",
                transcript="I think maybe I guess I probably did something, I'm not sure. Sort of worked out.",
                duration_ms=15000,
            )

        # AI clarity overrides what would be a lower rule-based score
        assert result["clarity_score"] == 0.95
        # AI confidence overrides rule-based negative signals
        assert result["confidence_score"] == 0.92

    @pytest.mark.asyncio
    async def test_missing_ai_keys_fall_through_to_defaults(self):
        """When AI returns partial JSON, missing keys should use rule-based defaults."""
        ai_json = json.dumps({
            "clarity": 0.88,
            # specificity, confidence, structure, example_quality, notes all missing
        })

        with patch("app.services.response_evaluator.ai_complete", new_callable=AsyncMock, return_value=ai_json):
            result = await evaluate_response(
                question_text="Tell me about a time you failed.",
                transcript="The project went well and the team was productive.",
                duration_ms=10000,
            )

        # AI clarity present
        assert result["clarity_score"] == 0.88
        # Missing AI keys fall through to defaults
        assert result["specificity_score"] == 0.5
        assert result["structure_score"] == 0.5
        assert result["example_quality"] == "vague"
        assert result["evaluator_notes"] == ""
        # confidence falls through to rule-based (neutral transcript -> 0.5)
        assert result["confidence_score"] == 0.5
