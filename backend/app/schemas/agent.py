import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MessageCreate(BaseModel):
    content: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class ConversationCreate(BaseModel):
    agent_name: str | None = None
    context_type: str = "general"
    context_id: uuid.UUID | None = None


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    agent_name: str
    context_type: str
    context_id: uuid.UUID | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut] = []
