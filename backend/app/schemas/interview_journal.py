import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class JournalEntryCreate(BaseModel):
    application_id: uuid.UUID
    event_id: uuid.UUID | None = None
    pipeline_stage: str | None = None
    entry_type: str = "note"
    title: str | None = None
    content: str | None = None
    outcome: str | None = None
    entry_date: datetime | None = None


class JournalEntryUpdate(BaseModel):
    event_id: uuid.UUID | None = None
    pipeline_stage: str | None = None
    entry_type: str | None = None
    title: str | None = None
    content: str | None = None
    outcome: str | None = None
    entry_date: datetime | None = None


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    user_id: uuid.UUID
    event_id: uuid.UUID | None = None
    pipeline_stage: str | None = None
    entry_type: str
    title: str | None = None
    content: str | None = None
    outcome: str | None = None
    entry_date: datetime
    created_at: datetime
    updated_at: datetime
