import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# --- Artifact schemas ---

class ArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    agent_name: str
    artifact_type: str
    title: str
    content: str
    content_format: str
    version: int
    created_at: datetime


# --- Workspace schemas ---

class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_id: uuid.UUID
    user_id: uuid.UUID
    status: str
    created_at: datetime
    updated_at: datetime
    artifacts: list[ArtifactOut] = []


class WorkspaceCreate(BaseModel):
    application_id: uuid.UUID


# --- Pipeline schemas ---

class PipelineRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    pipeline_type: str
    status: str
    current_agent: str | None = None
    completed_agents: str
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class PipelineStartRequest(BaseModel):
    pipeline_type: str = "full"  # "full" or "quick"


# --- Preflight schemas ---

class PreflightItem(BaseModel):
    """A single data requirement for an agent."""
    name: str
    description: str
    status: str  # "ready", "missing", "partial"
    source: str  # where to get it: "profile", "job_listing", "workspace", "user_input"
    detail: str | None = None  # specific guidance for the user


class PreflightResult(BaseModel):
    """Result of an agent's preflight check."""
    agent_name: str
    ready: bool
    items: list[PreflightItem]
    suggestion: str | None = None  # what the agent suggests the user do first


# --- Agent task schemas (for user-directed mode) ---

class AgentTaskRequest(BaseModel):
    """Request to run an agent task against a workspace."""
    agent_name: str
    task_type: str | None = None  # optional override; defaults to agent's primary task
    additional_instructions: str | None = None  # user-provided guidance


class AgentTaskResult(BaseModel):
    """Result of an agent task execution."""
    agent_name: str
    artifacts_created: list[ArtifactOut]
    summary: str
    next_suggested_agent: str | None = None
    preflight_warnings: list[PreflightItem] = []
