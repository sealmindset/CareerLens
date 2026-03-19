from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_jobs: int
    active_applications: int
    interviews: int
    offers: int
    match_rate: str
    profile_completeness: str
    skills_count: int
    recent_activity: int
