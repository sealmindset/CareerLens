import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SkillItem(BaseModel):
    skill_name: str
    proficiency_level: str = "intermediate"
    years_experience: int | None = None
    context: str | None = None  # where this skill was demonstrated


class ExperienceItem(BaseModel):
    company: str
    title: str
    description: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    accomplishments: list[str] | None = None
    leadership_indicators: list[str] | None = None
    scope_metrics: dict | None = None  # team_size, budget, org_reach, etc.


class EducationItem(BaseModel):
    institution: str
    degree: str | None = None
    field_of_study: str | None = None
    graduation_date: str | None = None
    relevant_coursework: list[str] | None = None


class CertificationItem(BaseModel):
    name: str
    issuer: str | None = None
    date_obtained: str | None = None
    expiry_date: str | None = None


class ResumeVariantCreate(BaseModel):
    name: str
    description: str | None = None
    target_roles: str | None = None
    matching_keywords: list[str] | None = None
    usage_guidance: str | None = None
    is_default: bool = False


class ResumeVariantUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_roles: str | None = None
    matching_keywords: list[str] | None = None
    usage_guidance: str | None = None
    is_default: bool | None = None
    headline: str | None = None
    summary: str | None = None
    raw_resume_text: str | None = None
    skills: list[SkillItem] | None = None
    experiences: list[ExperienceItem] | None = None
    educations: list[EducationItem] | None = None
    certifications: list[CertificationItem] | None = None
    additional_sections: dict | None = None
    change_summary: str | None = None  # for version tracking


class ResumeVariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    target_roles: str | None = None
    matching_keywords: list | None = None
    usage_guidance: str | None = None
    is_default: bool
    headline: str | None = None
    summary: str | None = None
    raw_resume_text: str | None = None
    skills: list | None = None
    experiences: list | None = None
    educations: list | None = None
    certifications: list | None = None
    additional_sections: dict | None = None
    current_version: int
    created_at: datetime
    updated_at: datetime


class ResumeVariantVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    variant_id: uuid.UUID
    version_number: int
    headline: str | None = None
    summary: str | None = None
    raw_resume_text: str | None = None
    skills: list | None = None
    experiences: list | None = None
    educations: list | None = None
    certifications: list | None = None
    additional_sections: dict | None = None
    change_summary: str | None = None
    created_at: datetime


class ResumeVariantDetailOut(ResumeVariantOut):
    versions: list[ResumeVariantVersionOut] = []


class ResumeUploadExtraction(BaseModel):
    """AI-extracted data from an uploaded resume, for review before saving."""
    headline: str | None = None
    summary: str | None = None
    skills: list[SkillItem] = []
    experiences: list[ExperienceItem] = []
    educations: list[EducationItem] = []
    certifications: list[CertificationItem] = []
    additional_sections: dict | None = None
    raw_resume_text: str = ""


class ResumeUploadReviewRequest(BaseModel):
    """User-reviewed extraction data to save to a variant."""
    headline: str | None = None
    summary: str | None = None
    skills: list[SkillItem] = []
    experiences: list[ExperienceItem] = []
    educations: list[EducationItem] = []
    certifications: list[CertificationItem] = []
    additional_sections: dict | None = None
    raw_resume_text: str | None = None
    change_summary: str | None = None


class VariantMatchResult(BaseModel):
    variant_id: uuid.UUID
    variant_name: str
    slug: str
    is_default: bool
    match_score: float  # 0-100
    reasoning: str
    matched_keywords: list[str] = []


class VariantDiffResult(BaseModel):
    version_a: int
    version_b: int
    sections: list[dict]  # [{section, label, value_a, value_b, changed}]


class VariantEvaluationResult(BaseModel):
    recommended: str  # "original" or "tailored"
    reasoning: str
    original_strengths: list[str]
    tailored_strengths: list[str]
    key_differences: list[str]


class VariantStatusBreakdown(BaseModel):
    submitted: int = 0
    interviewing: int = 0
    offer: int = 0
    rejected: int = 0
    withdrawn: int = 0
    other: int = 0


class VariantStatsItem(BaseModel):
    variant_id: uuid.UUID
    variant_name: str
    is_default: bool
    total_applications: int = 0
    original_count: int = 0
    tailored_count: int = 0
    status_breakdown: VariantStatusBreakdown = VariantStatusBreakdown()
    interview_rate: float = 0.0  # percentage of submitted apps that reached interview+
    offer_rate: float = 0.0  # percentage of submitted apps that reached offer


class VariantStatsResponse(BaseModel):
    variants: list[VariantStatsItem] = []
    unlinked_applications: int = 0  # applications without a variant
