import pytest

from app.services.question_generator import _fallback_questions


class TestFallbackQuestions:
    def test_behavioral_count(self):
        questions = _fallback_questions("Software Engineer", 10, "behavioral")
        assert len(questions) == 10
        for q in questions:
            assert "text" in q
            assert "index" in q
            assert "type" in q
            assert "expected_signals" in q

    def test_technical_count(self):
        questions = _fallback_questions("Data Scientist", 5, "technical")
        assert len(questions) == 5

    def test_conversational_count(self):
        questions = _fallback_questions("Product Manager", 3, "conversational")
        assert len(questions) == 3

    def test_indices_sequential(self):
        questions = _fallback_questions("Tester", 8, "behavioral")
        for i, q in enumerate(questions):
            assert q["index"] == i + 1

    def test_unknown_style_defaults_behavioral(self):
        questions = _fallback_questions("Role", 3, "unknown_style")
        assert len(questions) == 3

    def test_more_than_pool_wraps(self):
        questions = _fallback_questions("Role", 15, "behavioral")
        assert len(questions) == 15
