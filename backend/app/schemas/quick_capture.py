import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.task import TaskOut
from app.schemas.event import EventOut


class QuickCaptureCreate(BaseModel):
    raw_text: str


class QuickCaptureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    raw_text: str
    processed: bool
    processed_at: datetime | None = None
    ai_summary: str | None = None
    extracted_tasks: dict | None = None
    related_entity_type: str | None = None
    related_entity_id: uuid.UUID | None = None
    created_at: datetime


class QuickCaptureProcessResult(BaseModel):
    capture: QuickCaptureOut
    classification: str  # full_jd, event, tasks, info
    tasks_created: list[TaskOut] = []
    event_created: EventOut | None = None
    summary: str | None = None
