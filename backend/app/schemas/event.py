import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EventCreate(BaseModel):
    application_id: uuid.UUID | None = None
    event_type: str = "initial_call"
    title: str
    scheduled_at: datetime | None = None
    timezone: str | None = None
    duration_minutes: int = 30
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    meeting_link: str | None = None
    platform: str | None = None
    location: str | None = None
    notes: str | None = None
    reminder_settings: dict | None = None


class EventUpdate(BaseModel):
    application_id: uuid.UUID | None = None
    event_type: str | None = None
    title: str | None = None
    scheduled_at: datetime | None = None
    timezone: str | None = None
    duration_minutes: int | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    meeting_link: str | None = None
    platform: str | None = None
    location: str | None = None
    prep_status: str | None = None
    notes: str | None = None
    reminder_settings: dict | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    application_id: uuid.UUID | None = None
    event_type: str
    title: str
    scheduled_at: datetime | None = None
    timezone: str | None = None
    duration_minutes: int
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    meeting_link: str | None = None
    platform: str | None = None
    location: str | None = None
    prep_status: str
    raw_note: str | None = None
    parsed_data: dict | None = None
    notes: str | None = None
    reminder_sent: bool
    reminder_settings: dict | None = None
    created_at: datetime
    updated_at: datetime
    # Enriched from linked application
    job_title: str | None = None
    job_company: str | None = None
    countdown_display: str | None = None


class NoteParseRequest(BaseModel):
    raw_note: str


class NoteParseResult(BaseModel):
    input_mode: str | None = None  # "quick_note" or "full_jd"
    contact_name: str | None = None
    contact_email: str | None = None
    role_title: str | None = None
    company: str | None = None
    location: str | None = None
    job_type: str | None = None
    event_type: str | None = None
    scheduled_time: str | None = None
    timezone: str | None = None
    platform: str | None = None
    duration_estimate: str | None = None
    contract_details: str | None = None
    source: str | None = None
    salary_range: str | None = None
    additional_notes: str | None = None
    # Full JD mode fields
    description: str | None = None
    requirements: list[dict] | None = None  # [{"text": "...", "type": "required|preferred|nice_to_have"}]
    confidence: dict[str, float] = {}


class NoteCreateRequest(BaseModel):
    raw_note: str
    overrides: dict | None = None


class EnrichedRequirement(BaseModel):
    text: str
    type: str = "required"
    outlier: bool = True
    matched_in: str | None = None  # "profile" | "story_bank" | None
    story_id: str | None = None


class OutlierCheckRequest(BaseModel):
    requirements: list[dict]


class OutlierCheckResponse(BaseModel):
    requirements: list[EnrichedRequirement] = []


class OutlierConfirmRequest(BaseModel):
    requirement_text: str
    skill_name: str
    description: str
    company: str | None = None
    repo_url: str | None = None


class OutlierConfirmResponse(BaseModel):
    story_id: uuid.UUID
    story_title: str
    message: str = "Experience saved to Story Bank"


class MeetingPrepResponse(BaseModel):
    event: EventOut
    match_analysis: str | None = None
    skill_gap_report: str | None = None
    company_brief: str | None = None
    culture_analysis: str | None = None
    interview_prep_guide: str | None = None
    star_responses: str | None = None
    recruiter_screen_guide: str | None = None
    story_cheatsheet: str | None = None
    relevant_stories: list[dict] = []
    shift_gears_briefing: str | None = None
    prep_completeness: int = 0
    missing_sections: list[str] = []
