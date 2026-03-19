import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PromptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    description: Optional[str] = None
    category: str
    agent_name: Optional[str] = None
    content: str
    model_tier: str
    temperature: float
    max_tokens: int
    is_active: bool
    status: str
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    version_count: int = 0


class PromptDetailOut(PromptOut):
    versions: list["PromptVersionOut"] = []


class PromptVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    prompt_id: uuid.UUID
    version: int
    content: str
    change_summary: Optional[str] = None
    changed_by: Optional[str] = None
    created_at: datetime


class PromptUpdate(BaseModel):
    content: Optional[str] = None
    change_summary: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    action: str = "save"  # save | test | publish
