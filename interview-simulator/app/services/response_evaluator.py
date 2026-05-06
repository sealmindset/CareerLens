import json
import logging

from app.services.ai_provider import ai_complete, parse_json_response
from app.services.nudge_engine import analyze_response

logger = logging.getLogger(__name__)

EVAL_SYSTEM_PROMPT = """You evaluate interview responses for COMMUNICATION quality.
You do NOT evaluate content correctness — only HOW WELL the candidate communicates.

Score each dimension from 0.0 to 1.0:
- clarity: Was the response easy to follow? Clear opening statement? Logical flow?
- specificity: Did they give concrete examples with metrics, numbers, or outcomes?
- confidence: Did they sound sure of themselves? (based on transcript word patterns — no hedging, no excessive qualifiers)
- structure: Did they use a clear framework? (Problem→Action→Result, or opening→body→close)

Also assess:
- example_quality: "none" | "vague" | "concrete" | "compelling"
- wrong_impression: any negative signals (humblebragging, negativity, blame, desperation, over-qualification)
- notes: 2-3 sentence actionable feedback

Return ONLY valid JSON, no markdown, no commentary."""


async def evaluate_response(
    question_text: str,
    transcript: str,
    duration_ms: int,
    expected_signals: list[str] | None = None,
) -> dict:
    # Rule-based analysis (instant, zero cost)
    rule_analysis = analyze_response(transcript, duration_ms)

    # AI-based evaluation (async)
    ai_eval = await _ai_evaluate(question_text, transcript, expected_signals)

    # Merge: AI scores take precedence, rule-based fills gaps
    merged = {
        "filler_words": rule_analysis["filler_words"],
        "filler_word_count": rule_analysis["filler_word_count"],
        "pace_wpm": rule_analysis["pace_wpm"],
        "trailing_off_count": rule_analysis["trailing_off_count"],
        "clarity_score": ai_eval.get("clarity", _rule_clarity(rule_analysis)),
        "specificity_score": ai_eval.get("specificity", 0.5),
        "confidence_score": ai_eval.get("confidence", rule_analysis["confidence"]["score"]),
        "structure_score": ai_eval.get("structure", 0.5),
        "example_quality": ai_eval.get("example_quality", "vague"),
        "evaluator_notes": ai_eval.get("notes", ""),
        "stalled": rule_analysis["filler_density"] > 0.15,
    }
    return merged


async def _ai_evaluate(
    question_text: str,
    transcript: str,
    expected_signals: list[str] | None,
) -> dict:
    signals_text = ""
    if expected_signals:
        signals_text = f"\nA strong answer would include: {', '.join(expected_signals)}"

    user_prompt = f"""Evaluate this interview response for COMMUNICATION quality only.

Question: {question_text}
{signals_text}

Candidate's response transcript:
\"\"\"{transcript}\"\"\"

Return JSON:
{{
  "clarity": 0.0-1.0,
  "specificity": 0.0-1.0,
  "confidence": 0.0-1.0,
  "structure": 0.0-1.0,
  "example_quality": "none" | "vague" | "concrete" | "compelling",
  "wrong_impression": ["signal1"] or [],
  "notes": "2-3 sentence feedback"
}}"""

    try:
        raw = await ai_complete(EVAL_SYSTEM_PROMPT, user_prompt, temperature=0.3)
        result = parse_json_response(raw)
        if isinstance(result, dict):
            return result
        return {}
    except Exception as exc:
        logger.warning("AI evaluation failed, using rule-based only: %s", exc)
        return {}


def _rule_clarity(analysis: dict) -> float:
    score = 0.7
    if analysis["filler_density"] > 0.1:
        score -= 0.2
    if analysis["trailing_off_count"] > 2:
        score -= 0.15
    pace = analysis.get("pace_wpm", 130)
    if pace < 80 or pace > 200:
        score -= 0.1
    return max(0.0, min(1.0, score))
