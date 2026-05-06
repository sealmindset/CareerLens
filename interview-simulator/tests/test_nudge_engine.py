import pytest

from app.services.nudge_engine import (
    analyze_response,
    calculate_pace_wpm,
    count_filler_words,
    detect_confidence_signals,
    detect_trailing_off,
    get_nudge_text,
    get_nudge_type,
)


class TestCountFillerWords:
    def test_no_fillers(self):
        result = count_filler_words("I delivered the project on time with measurable results.")
        assert result == {}

    def test_single_filler(self):
        result = count_filler_words("I um delivered the project on time.")
        assert result == {"um": 1}

    def test_multiple_fillers(self):
        result = count_filler_words("Um, you know, I basically just like did the thing, you know.")
        assert "um" in result
        assert "you know" in result
        assert "basically" in result
        assert "like" in result

    def test_case_insensitive(self):
        result = count_filler_words("BASICALLY I think it was SORT OF fine.")
        assert "basically" in result
        assert "sort of" in result


class TestCalculatePaceWpm:
    def test_normal_pace(self):
        transcript = " ".join(["word"] * 150)
        wpm = calculate_pace_wpm(transcript, 60000)
        assert wpm == 150

    def test_zero_duration(self):
        assert calculate_pace_wpm("some words", 0) == 0

    def test_fast_pace(self):
        transcript = " ".join(["word"] * 200)
        wpm = calculate_pace_wpm(transcript, 60000)
        assert wpm == 200


class TestDetectConfidenceSignals:
    def test_positive_signals(self):
        result = detect_confidence_signals(
            "Specifically, I led the team and we achieved a 30% improvement."
        )
        assert result["positive_signals"] >= 2
        assert result["score"] > 0.5

    def test_negative_signals(self):
        result = detect_confidence_signals(
            "I think maybe I guess I probably did something, I'm not sure."
        )
        assert result["negative_signals"] >= 3
        assert result["score"] < 0.5

    def test_neutral(self):
        result = detect_confidence_signals("The project went well and the team was productive.")
        assert result["score"] == 0.5


class TestDetectTrailingOff:
    def test_no_trailing(self):
        count = detect_trailing_off("I delivered the project. The results were great. We celebrated.")
        assert count == 0

    def test_ellipsis_trailing(self):
        count = detect_trailing_off("I started working on... and then... so we...")
        assert count >= 2

    def test_incomplete_sentences(self):
        count = detect_trailing_off("And then. But also. So yeah.")
        assert count >= 2


class TestGetNudgeType:
    def test_long_silence(self):
        assert get_nudge_type(12000, 0.0, 0, 30) == "silence_long"

    def test_short_silence(self):
        assert get_nudge_type(6000, 0.0, 0, 30) == "silence_short"

    def test_trailing_off(self):
        assert get_nudge_type(0, 0.0, 3, 30) == "trailing_off"

    def test_rambling(self):
        assert get_nudge_type(0, 0.0, 0, 130, 120) == "rambling"

    def test_no_nudge(self):
        assert get_nudge_type(2000, 0.02, 1, 30) is None

    def test_nudge_text_exists(self):
        for nudge_type in ["silence_short", "silence_long", "trailing_off", "rambling"]:
            text = get_nudge_text(nudge_type)
            assert len(text) > 10


class TestAnalyzeResponse:
    def test_clean_response(self):
        transcript = "I led a team of five engineers to redesign our payment system. We achieved a 40 percent reduction in processing time."
        result = analyze_response(transcript, 30000)
        assert result["filler_word_count"] == 0
        assert result["pace_wpm"] > 0
        assert result["trailing_off_count"] == 0

    def test_filler_heavy_response(self):
        transcript = "Um so basically I like you know did the thing and um it was like sort of okay I guess."
        result = analyze_response(transcript, 15000)
        assert result["filler_word_count"] > 3
        assert result["filler_density"] > 0.1
