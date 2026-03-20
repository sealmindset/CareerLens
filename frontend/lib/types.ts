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

export interface ResumeUploadResult {
  profile: Profile;
  skills_added: number;
  experiences_added: number;
  educations_added: number;
  raw_text_length: number;
  error: string | null;
}

export interface JobScrapeResult {
  title: string | null;
  company: string | null;
  location: string | null;
  salary_range: string | null;
  job_type: string | null;
  description: string | null;
  source: string | null;
  requirements: { text: string; type: string }[] | null;
  error: string | null;
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

export interface ManagedPrompt {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  agent_name: string | null;
  content: string;
  model_tier: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  status: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
}

export interface ManagedPromptDetail extends ManagedPrompt {
  versions: PromptVersion[];
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version: number;
  content: string;
  change_summary: string | null;
  changed_by: string | null;
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

// Workspace types
export interface WorkspaceArtifact {
  id: string;
  workspace_id: string;
  agent_name: string;
  artifact_type: string;
  title: string;
  content: string;
  content_format: string;
  version: number;
  created_at: string;
}

export interface AgentWorkspace {
  id: string;
  application_id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  artifacts: WorkspaceArtifact[];
}

export interface PipelineRun {
  id: string;
  workspace_id: string;
  pipeline_type: string;
  status: string;
  current_agent: string | null;
  completed_agents: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreflightItem {
  name: string;
  description: string;
  status: string;
  source: string;
  detail: string | null;
}

export interface PreflightResult {
  agent_name: string;
  ready: boolean;
  items: PreflightItem[];
  suggestion: string | null;
}

export interface AgentTaskResult {
  agent_name: string;
  artifacts_created: WorkspaceArtifact[];
  summary: string;
  next_suggested_agent: string | null;
  preflight_warnings: PreflightItem[];
}
