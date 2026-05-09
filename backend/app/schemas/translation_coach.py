import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# --- Request schemas ---


class SessionCreate(BaseModel):
    job_description: str | None = None


class AttemptCreate(BaseModel):
    session_id: str
    question_id: str | None = None
    custom_question: str | None = None
    original_answer: str


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None


# --- Response schemas ---


class ScoringBreakdown(BaseModel):
    led_with_problem: bool
    business_outcome_present: bool
    jargon_translated: bool
    used_employers_language: bool
    quantified_impact: bool


class FlaggedPhrase(BaseModel):
    original: str
    suggested: str
    start_idx: int
    end_idx: int


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    question_text: str
    difficulty: str
    hint: str | None
    sort_order: int


class AttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    question_id: uuid.UUID | None
    custom_question: str | None
    original_answer: str
    drift_score: float
    signal: str
    scoring_breakdown: dict
    flagged_phrases: list[dict] | None
    translated_version: str | None
    coaching_note: str | None
    created_at: datetime


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    job_description: str | None
    started_at: datetime
    completed_at: datetime | None
    question_count: int
    avg_drift_score: float | None
    attempts: list[AttemptOut] = []


class SessionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    started_at: datetime
    completed_at: datetime | None
    question_count: int
    avg_drift_score: float | None


class TrendData(BaseModel):
    sessions: list[SessionListItem]
    overall_avg: float | None
    total_attempts: int
    improvement_pct: float | None
