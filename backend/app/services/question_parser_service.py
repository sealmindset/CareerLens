import csv
import io
import json
import os

from app.ai.provider import get_ai_provider, get_model_for_tier

ALLOWED_FILE_KEYS = {
    "question_text", "company", "role_title", "interview_stage",
    "interview_format", "date_asked", "topic_tags", "notes",
    "model_answer", "outcome",
}


async def parse_questions_from_file(contents: bytes, filename: str) -> list[dict]:
    ext = os.path.splitext(filename)[1].lower()
    text = contents.decode("utf-8", errors="replace")

    if ext == ".json":
        return _parse_json(text)
    elif ext == ".csv":
        return _parse_csv(text)
    elif ext == ".txt":
        return _parse_txt(text)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use .csv, .json, or .txt")


def _parse_json(text: str) -> list[dict]:
    data = json.loads(text)
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ValueError("JSON must be an array of question objects")
    results = []
    for item in data:
        if not isinstance(item, dict):
            continue
        q = {k: v for k, v in item.items() if k in ALLOWED_FILE_KEYS and v}
        if not q.get("question_text"):
            continue
        if isinstance(q.get("topic_tags"), str):
            q["topic_tags"] = [t.strip() for t in q["topic_tags"].split(",") if t.strip()]
        results.append(q)
    return results


def _parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    results = []
    for row in reader:
        q = {}
        for k, v in row.items():
            key = k.strip().lower().replace(" ", "_")
            if key in ALLOWED_FILE_KEYS and v and v.strip():
                q[key] = v.strip()
        if not q.get("question_text"):
            continue
        if isinstance(q.get("topic_tags"), str):
            q["topic_tags"] = [t.strip() for t in q["topic_tags"].split(",") if t.strip()]
        results.append(q)
    return results


def _parse_txt(text: str) -> list[dict]:
    blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
    return [{"question_text": block} for block in blocks]


TRANSCRIPT_SYSTEM_PROMPT = """You are analyzing an interview recording transcript. Extract every distinct interview question that the interviewer asked.

For each question, return a JSON object with these fields:
- question_text (required): The exact or closely paraphrased question
- company: Company name if mentioned
- role_title: Job title/role if mentioned
- interview_stage: One of: phone_screen, recruiter, technical, behavioral, panel, virtual, onsite, final, other
- topic_tags: Array of topic keywords (e.g. ["leadership", "system-design", "conflict-resolution"])
- notes: Any context about how the candidate answered, or relevant follow-up discussion

Return a JSON array of objects. If no questions are found, return an empty array [].
Only return the JSON array, no other text."""


async def parse_questions_from_transcript(transcript: str) -> list[dict]:
    provider = get_ai_provider()
    model = get_model_for_tier("standard")

    raw = await provider.complete(
        system_prompt=TRANSCRIPT_SYSTEM_PROMPT,
        user_prompt=f"Transcript:\n\n{transcript}",
        model=model,
        temperature=0.1,
        max_tokens=8192,
    )

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    try:
        questions = json.loads(cleaned)
    except json.JSONDecodeError:
        return [{"question_text": transcript[:500], "notes": "AI could not parse structured questions from this transcript"}]

    if not isinstance(questions, list):
        questions = [questions]

    results = []
    for item in questions:
        if not isinstance(item, dict) or not item.get("question_text"):
            continue
        q = {k: v for k, v in item.items() if k in ALLOWED_FILE_KEYS and v}
        results.append(q)

    return results
