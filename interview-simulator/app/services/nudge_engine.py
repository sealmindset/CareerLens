import re

FILLER_WORDS = {
    "um", "uh", "like", "you know", "basically", "actually",
    "sort of", "kind of", "i mean", "right", "so yeah",
    "literally", "honestly", "essentially",
}

CONFIDENCE_NEGATIVE = [
    "i think maybe", "i'm not sure", "probably", "i guess",
    "i don't know", "maybe", "not really sure", "sort of",
]

CONFIDENCE_POSITIVE = [
    "specifically", "the result was", "i led", "we achieved",
    "i delivered", "i implemented", "the impact was", "measurably",
    "the outcome", "i drove", "i built",
]

NUDGE_TEMPLATES = {
    "silence_short": "Take your time. Would you like me to rephrase the question?",
    "silence_long": "No worries — let's move to the next question if you'd prefer.",
    "trailing_off": "That's a good start. Can you walk me through a specific example?",
    "rambling": "Great detail — to be mindful of time, what was the key outcome?",
}


def count_filler_words(transcript: str) -> dict[str, int]:
    text_lower = transcript.lower()
    counts: dict[str, int] = {}
    for filler in sorted(FILLER_WORDS, key=len, reverse=True):
        pattern = r'\b' + re.escape(filler) + r'\b'
        matches = re.findall(pattern, text_lower)
        if matches:
            counts[filler] = len(matches)
    return counts


def calculate_pace_wpm(transcript: str, duration_ms: int) -> int:
    if duration_ms <= 0:
        return 0
    word_count = len(transcript.split())
    minutes = duration_ms / 60000
    return round(word_count / minutes) if minutes > 0 else 0


def detect_confidence_signals(transcript: str) -> dict:
    text_lower = transcript.lower()
    neg_count = sum(1 for phrase in CONFIDENCE_NEGATIVE if phrase in text_lower)
    pos_count = sum(1 for phrase in CONFIDENCE_POSITIVE if phrase in text_lower)
    total = neg_count + pos_count
    score = pos_count / total if total > 0 else 0.5
    return {
        "positive_signals": pos_count,
        "negative_signals": neg_count,
        "score": round(score, 2),
    }


def detect_trailing_off(transcript: str) -> int:
    sentences = re.split(r'[.!?]+', transcript)
    trailing = 0
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if s.endswith("...") or s.endswith("..") or s.endswith(","):
            trailing += 1
        elif len(s.split()) < 4 and s.lower().startswith(("and ", "but ", "so ")):
            trailing += 1
    return trailing


def get_nudge_type(
    silence_ms: int,
    filler_density: float,
    trailing_count: int,
    response_duration_s: int,
    ramble_threshold_s: int = 120,
) -> str | None:
    if silence_ms > 10000:
        return "silence_long"
    if silence_ms > 5000:
        return "silence_short"
    if trailing_count >= 3:
        return "trailing_off"
    if response_duration_s > ramble_threshold_s:
        return "rambling"
    return None


def get_nudge_text(nudge_type: str) -> str:
    return NUDGE_TEMPLATES.get(nudge_type, NUDGE_TEMPLATES["silence_short"])


def analyze_response(transcript: str, duration_ms: int) -> dict:
    fillers = count_filler_words(transcript)
    filler_count = sum(fillers.values())
    word_count = len(transcript.split())
    filler_density = filler_count / max(word_count, 1)
    pace = calculate_pace_wpm(transcript, duration_ms)
    confidence = detect_confidence_signals(transcript)
    trailing = detect_trailing_off(transcript)

    return {
        "filler_words": fillers,
        "filler_word_count": filler_count,
        "filler_density": round(filler_density, 3),
        "pace_wpm": pace,
        "confidence": confidence,
        "trailing_off_count": trailing,
        "word_count": word_count,
    }
