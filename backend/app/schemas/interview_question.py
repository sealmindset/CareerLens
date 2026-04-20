import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class InterviewQuestionCreate(BaseModel):
    question_text: str
    company: str | None = None
    role_title: str | None = None
    interview_stage: str | None = None
    interview_format: str | None = None
    date_asked: date | None = None
    topic_tags: list[str] | None = None
    linked_story_ids: list[uuid.UUID] | None = None
    notes: str | None = None
    model_answer: str | None = None
    outcome: str | None = None
    source_job_id: uuid.UUID | None = None


class InterviewQuestionUpdate(BaseModel):
    question_text: str | None = None
    company: str | None = None
    role_title: str | None = None
    interview_stage: str | None = None
    interview_format: str | None = None
    date_asked: date | None = None
    topic_tags: list[str] | None = None
    linked_story_ids: list[uuid.UUID] | None = None
    notes: str | None = None
    model_answer: str | None = None
    outcome: str | None = None
    status: str | None = None
    source_job_id: uuid.UUID | None = None


class InterviewQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    company: str | None
    role_title: str | None
    question_text: str
    interview_stage: str | None
    interview_format: str | None
    date_asked: date | None
    topic_tags: list[str] | None
    linked_story_ids: list[uuid.UUID] | None
    notes: str | None
    model_answer: str | None
    outcome: str | None
    status: str
    source_job_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class InterviewQuestionSummary(BaseModel):
    total_count: int
    active_count: int
    archived_count: int
    unique_companies: int
    most_recent_date: date | None


class FileImportResult(BaseModel):
    questions: list[InterviewQuestionOut]
    imported_count: int
    errors: list[str] | None = None


class TranscribeResult(BaseModel):
    transcript: str
    parsed_questions: list[dict]


class BulkCreateRequest(BaseModel):
    questions: list[InterviewQuestionCreate]
