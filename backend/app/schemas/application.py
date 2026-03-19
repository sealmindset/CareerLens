import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ApplicationCreate(BaseModel):
    job_listing_id: uuid.UUID
    submission_mode: str = "review"
    notes: str | None = None


class ApplicationUpdate(BaseModel):
    notes: str | None = None
    status: str | None = None
    follow_up_date: date | None = None
    tailored_resume: str | None = None
    cover_letter: str | None = None
    submission_mode: str | None = None


class ApplicationStatusUpdate(BaseModel):
    status: str


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    job_listing_id: uuid.UUID
    status: str
    tailored_resume: str | None = None
    cover_letter: str | None = None
    submission_mode: str
    submitted_at: datetime | None = None
    follow_up_date: date | None = None
    notes: str | None = None
    job_title: str | None = None
    job_company: str | None = None
    created_at: datetime
    updated_at: datetime
