import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class JobRequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_listing_id: uuid.UUID
    requirement_text: str
    requirement_type: str
    is_met: bool | None = None
    gap_notes: str | None = None


class JobScrapeRequest(BaseModel):
    url: str


class JobScrapeResult(BaseModel):
    title: str | None = None
    company: str | None = None
    location: str | None = None
    salary_range: str | None = None
    job_type: str | None = None
    description: str | None = None
    source: str | None = None
    requirements: list[dict] | None = None
    application_method: str | None = None
    application_platform: str | None = None
    application_method_details: str | None = None
    error: str | None = None


class JobListingCreate(BaseModel):
    url: str
    title: str = ""
    company: str = ""
    description: str | None = None
    location: str | None = None
    salary_range: str | None = None
    job_type: str | None = None
    source: str = "manual"


class JobListingUpdate(BaseModel):
    title: str | None = None
    company: str | None = None
    description: str | None = None
    location: str | None = None
    salary_range: str | None = None
    job_type: str | None = None
    source: str | None = None
    status: str | None = None
    application_method: str | None = None
    application_platform: str | None = None
    application_method_details: str | None = None


class JobListingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    company: str
    url: str
    description: str | None = None
    location: str | None = None
    salary_range: str | None = None
    job_type: str | None = None
    source: str
    status: str
    match_score: float | None = None
    match_analysis: str | None = None
    application_method: str | None = None
    application_platform: str | None = None
    application_method_details: str | None = None
    created_at: datetime
    updated_at: datetime
    requirements: list[JobRequirementOut] = []
