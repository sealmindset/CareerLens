import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AgentContext(BaseModel):
    skill_gaps: Any = None
    hiring_manager_review: str | None = None
    story_bank_summaries: Any = None
    interview_prep_brief: str | None = None
    candidate_seniority: str | None = None
    interview_stage: str | None = None


class SessionCreate(BaseModel):
    application_id: uuid.UUID | None = None
    job_title: str
    company: str
    job_description: str | None = None
    interviewer_context: str | None = None
    interview_style: str = "behavioral"
    question_count: int = Field(default=10, ge=3, le=20)
    agent_context: AgentContext | None = None


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_index: int
    question_text: str
    question_type: str | None = None


class ResponseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_id: uuid.UUID
    transcript: str
    duration_ms: int | None = None
    filler_word_count: int = 0
    filler_words: dict | None = None
    silence_gaps: list | None = None
    pace_wpm: int | None = None
    clarity_score: float | None = None
    specificity_score: float | None = None
    confidence_score: float | None = None
    structure_score: float | None = None
    example_quality: str | None = None
    evaluator_notes: str | None = None
    stalled: bool = False
    was_nudged: bool = False
    trailing_off_count: int = 0


class QuestionWithResponseOut(QuestionOut):
    response: ResponseOut | None = None


class DebriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    overall_score: int | None = None
    clarity_score: int | None = None
    specificity_score: int | None = None
    confidence_score: int | None = None
    structure_score: int | None = None
    conciseness_score: int | None = None
    what_landed: str | None = None
    what_missed: str | None = None
    portfolio_gaps: str | None = None
    improvement_plan: str | None = None
    story_utilization: str | None = None
    gap_correlation: str | None = None
    exported_to_workspace: bool = False
    created_at: datetime


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID | None = None
    job_title: str
    company: str
    job_description: str | None = None
    interviewer_context: str | None = None
    interview_style: str
    status: str
    question_count: int
    overall_score: dict | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SessionDetailOut(SessionOut):
    questions: list[QuestionWithResponseOut] = []
    debrief: DebriefOut | None = None


class SessionListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_title: str
    company: str
    interview_style: str
    status: str
    question_count: int
    overall_score: dict | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
