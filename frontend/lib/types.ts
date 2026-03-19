// AuthMe matches JWT payload EXACTLY -- flat, no .user wrapper
export interface AuthMe {
  sub: string;
  email: string;
  name: string;
  role_id: string;
  role_name: string;
  permissions: string[];
}

export interface User {
  id: string;
  oidc_subject: string;
  email: string;
  display_name: string;
  is_active: boolean;
  role_id: string;
  role_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

// Domain types
export interface Profile {
  id: string;
  user_id: string;
  headline: string | null;
  summary: string | null;
  raw_resume_text: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
  skills: ProfileSkill[];
  experiences: ProfileExperience[];
  educations: ProfileEducation[];
}

export interface ProfileSkill {
  id: string;
  profile_id: string;
  skill_name: string;
  proficiency_level: string;
  years_experience: number | null;
  source: string;
  created_at: string;
}

export interface ProfileExperience {
  id: string;
  profile_id: string;
  company: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
}

export interface ProfileEducation {
  id: string;
  profile_id: string;
  institution: string;
  degree: string;
  field_of_study: string | null;
  graduation_date: string | null;
  created_at: string;
}

export interface JobListing {
  id: string;
  user_id: string;
  title: string;
  company: string;
  url: string;
  description: string | null;
  location: string | null;
  salary_range: string | null;
  job_type: string;
  source: string;
  status: string;
  match_score: number | null;
  match_analysis: string | null;
  requirements: JobRequirement[];
  created_at: string;
  updated_at: string;
}

export interface JobRequirement {
  id: string;
  job_listing_id: string;
  requirement_text: string;
  requirement_type: string;
  is_met: boolean | null;
  gap_notes: string | null;
}

export interface Application {
  id: string;
  user_id: string;
  job_listing_id: string;
  status: string;
  tailored_resume: string | null;
  cover_letter: string | null;
  submission_mode: string;
  submitted_at: string | null;
  follow_up_date: string | null;
  notes: string | null;
  job_title: string | null;
  job_company: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentConversation {
  id: string;
  user_id: string;
  agent_name: string;
  context_type: string;
  context_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface DashboardStats {
  total_jobs: number;
  active_applications: number;
  interviews: number;
  offers: number;
  match_rate: string;
  profile_completeness: string;
  skills_count: number;
  recent_activity: number;
}
