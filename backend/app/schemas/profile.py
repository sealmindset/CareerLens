import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


# --- Skills ---
class SkillCreate(BaseModel):
    skill_name: str
    proficiency_level: str = "intermediate"
    years_experience: int | None = None
    source: str = "manual"


class SkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    profile_id: uuid.UUID
    skill_name: str
    proficiency_level: str
    years_experience: int | None = None
    source: str
    created_at: datetime


# --- Experience ---
class ExperienceCreate(BaseModel):
    company: str
    title: str
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool = False


class ExperienceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    profile_id: uuid.UUID
    company: str
    title: str
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool
    created_at: datetime


# --- Education ---
class EducationCreate(BaseModel):
    institution: str
    degree: str | None = None
    field_of_study: str | None = None
    graduation_date: date | None = None


class EducationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    profile_id: uuid.UUID
    institution: str
    degree: str | None = None
    field_of_study: str | None = None
    graduation_date: date | None = None
    created_at: datetime


# --- Profile ---
class ProfileCreate(BaseModel):
    headline: str | None = None
    summary: str | None = None
    linkedin_url: str | None = None


class ProfileUpdate(BaseModel):
    headline: str | None = None
    summary: str | None = None
    linkedin_url: str | None = None
    raw_resume_text: str | None = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    headline: str | None = None
    summary: str | None = None
    raw_resume_text: str | None = None
    linkedin_url: str | None = None
    created_at: datetime
    updated_at: datetime
    skills: list[SkillOut] = []
    experiences: list[ExperienceOut] = []
    educations: list[EducationOut] = []


class ResumeUploadResult(BaseModel):
    profile: ProfileOut
    skills_added: int = 0
    experiences_added: int = 0
    educations_added: int = 0
    raw_text_length: int = 0
    error: str | None = None


# --- Experience AI Assist ---
class ConversationMessage(BaseModel):
    role: str  # "user" or "ai"
    content: str

class ExperienceAIRequest(BaseModel):
    action: str  # "enhance", "interview", "improve", or "chat"
    message: str | None = None
    history: list[ConversationMessage] = []


class ExperienceAIResponse(BaseModel):
    suggestion: str


# --- Brand AI Assist (Headline / Summary) ---
class BrandAIRequest(BaseModel):
    field: str  # "headline" or "summary"
    action: str  # "generate", "chat"
    message: str | None = None
    history: list[ConversationMessage] = []


class BrandAIResponse(BaseModel):
    suggestion: str
