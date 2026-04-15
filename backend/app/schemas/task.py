import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    application_id: uuid.UUID | None = None
    priority: str = "normal"
    due_date: date | None = None
    due_reason: str | None = None
    source_type: str = "manual"


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: date | None = None
    application_id: uuid.UUID | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    application_id: uuid.UUID | None = None
    source_type: str
    source_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    status: str
    priority: str
    due_date: date | None = None
    due_reason: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
