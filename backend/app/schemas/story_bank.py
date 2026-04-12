import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StoryCreate(BaseModel):
    source_bullet: str
    story_title: str
    problem: str
    solved: str
    deployed: str
    takeaway: str | None = None
    hook_line: str | None = None
    trigger_keywords: list[str] | None = None
    proof_metric: str | None = None
    source_company: str | None = None
    source_title: str | None = None
    source_variant_id: uuid.UUID | None = None


class StoryBulkCreate(BaseModel):
    stories: list[StoryCreate]


class StoryUpdate(BaseModel):
    story_title: str | None = None
    problem: str | None = None
    solved: str | None = None
    deployed: str | None = None
    takeaway: str | None = None
    hook_line: str | None = None
    trigger_keywords: list[str] | None = None
    proof_metric: str | None = None
    source_company: str | None = None
    source_title: str | None = None
    change_summary: str | None = None


class StoryVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    story_id: uuid.UUID
    version_number: int
    problem: str | None
    solved: str | None
    deployed: str | None
    takeaway: str | None
    hook_line: str | None
    trigger_keywords: list[str] | None
    proof_metric: str | None
    change_summary: str | None
    created_at: datetime


class StoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    source_bullet: str
    source_variant_id: uuid.UUID | None
    source_company: str | None
    source_title: str | None
    story_title: str
    problem: str
    solved: str
    deployed: str
    takeaway: str | None
    hook_line: str | None
    trigger_keywords: list[str] | None
    proof_metric: str | None
    status: str
    times_used: int
    current_version: int
    created_at: datetime
    updated_at: datetime
    version_count: int = 0


class StoryDetailOut(StoryOut):
    versions: list[StoryVersionOut] = []


class StoryBankSummary(BaseModel):
    total_count: int
    active_count: int
    archived_count: int
    unique_companies: int
    most_recent_update: datetime | None
