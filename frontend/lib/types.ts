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

export interface ProfileBuildResult {
  skills_added: number;
  experiences_added: number;
  educations_added: number;
  headline_updated: boolean;
  summary_updated: boolean;
  variants_processed: number;
  skipped_reason: string | null;
}

export interface ExperienceAIResponse {
  suggestion: string;
}

export interface BrandAIResponse {
  suggestion: string;
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
  application_method: string | null;
  application_platform: string | null;
  application_method_details: string | null;
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
  resume_variant_id: string | null;
  resume_type: string | null;
  resume_variant_name: string | null;
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

// Application Form types (Auto-Fill modal)
export interface ApplicationFormField {
  key: string;
  label: string;
  value: string;
  field_type: string;
  options?: string[] | null;
  required: boolean;
  section: string;
}

export interface ApplicationFormData {
  fields: ApplicationFormField[];
  job_title: string;
  job_company: string;
}

export interface CompletenessCheckResult {
  complete: boolean;
  total_fields: number;
  filled_fields: number;
  issues: { field_key: string; field_label: string; issue: string }[];
}

export interface BestFitReviewResult {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  improvements: {
    field_key: string;
    field_label: string;
    current_value: string;
    suggestion: string;
  }[];
}

// Resume Variant types
export interface ResumeVariant {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  target_roles: string | null;
  matching_keywords: string[] | null;
  usage_guidance: string | null;
  is_default: boolean;
  headline: string | null;
  summary: string | null;
  raw_resume_text: string | null;
  skills: Record<string, unknown>[] | null;
  experiences: Record<string, unknown>[] | null;
  educations: Record<string, unknown>[] | null;
  certifications: Record<string, unknown>[] | null;
  additional_sections: Record<string, unknown> | null;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface ResumeVariantVersion {
  id: string;
  variant_id: string;
  version_number: number;
  headline: string | null;
  summary: string | null;
  raw_resume_text: string | null;
  skills: Record<string, unknown>[] | null;
  experiences: Record<string, unknown>[] | null;
  educations: Record<string, unknown>[] | null;
  certifications: Record<string, unknown>[] | null;
  additional_sections: Record<string, unknown> | null;
  change_summary: string | null;
  created_at: string;
}

export interface ResumeVariantDetail extends ResumeVariant {
  versions: ResumeVariantVersion[];
}

export interface ResumeUploadExtraction {
  headline: string | null;
  summary: string | null;
  skills: { skill_name: string; proficiency_level: string; years_experience: number | null; context: string | null }[];
  experiences: { company: string; title: string; description: string | null; start_date: string | null; end_date: string | null; is_current: boolean; accomplishments: string[] | null; leadership_indicators: string[] | null; scope_metrics: Record<string, unknown> | null }[];
  educations: { institution: string; degree: string | null; field_of_study: string | null; graduation_date: string | null; relevant_coursework: string[] | null }[];
  certifications: { name: string; issuer: string | null; date_obtained: string | null; expiry_date: string | null }[];
  additional_sections: Record<string, unknown> | null;
  raw_resume_text: string;
}

export interface VariantMatchResult {
  variant_id: string;
  variant_name: string;
  slug: string;
  is_default: boolean;
  match_score: number;
  reasoning: string;
  matched_keywords: string[];
}

export interface VariantDiffResult {
  version_a: number;
  version_b: number;
  sections: { section: string; label: string; value_a: string; value_b: string; changed: boolean }[];
}

export interface VariantEvaluationResult {
  recommended: string;
  reasoning: string;
  original_strengths: string[];
  tailored_strengths: string[];
  key_differences: string[];
}

export interface VariantStatusBreakdown {
  submitted: number;
  interviewing: number;
  offer: number;
  rejected: number;
  withdrawn: number;
  other: number;
}

export interface VariantStatsItem {
  variant_id: string;
  variant_name: string;
  is_default: boolean;
  total_applications: number;
  original_count: number;
  tailored_count: number;
  status_breakdown: VariantStatusBreakdown;
  interview_rate: number;
  offer_rate: number;
}

export interface VariantStatsResponse {
  variants: VariantStatsItem[];
  unlinked_applications: number;
}

// Story Bank types
export interface StoryBankStory {
  id: string;
  user_id: string;
  source_bullet: string;
  source_variant_id: string | null;
  source_company: string | null;
  source_title: string | null;
  story_title: string;
  problem: string;
  solved: string;
  deployed: string;
  takeaway: string | null;
  hook_line: string | null;
  trigger_keywords: string[] | null;
  proof_metric: string | null;
  status: string;
  times_used: number;
  current_version: number;
  created_at: string;
  updated_at: string;
  version_count: number;
}

export interface StoryBankStoryVersion {
  id: string;
  story_id: string;
  version_number: number;
  problem: string | null;
  solved: string | null;
  deployed: string | null;
  takeaway: string | null;
  hook_line: string | null;
  trigger_keywords: string[] | null;
  proof_metric: string | null;
  change_summary: string | null;
  created_at: string;
}

export interface StoryBankStoryDetail extends StoryBankStory {
  versions: StoryBankStoryVersion[];
}

export interface StoryBankSummary {
  total_count: number;
  active_count: number;
  archived_count: number;
  unique_companies: number;
  most_recent_update: string | null;
}

// Chatbot simulation types (Auto-Fill modal, chatbot mode)
export interface DetectedMethodResult {
  method: string;
  platform: string;
  job_title: string;
  job_company: string;
  job_url: string;
}

export interface ChatbotQuestionItem {
  index: number;
  question: string;
  suggested_answer: string;
  field_name: string;
  confidence: string;
  approved_answer: string | null;
  status: string;
}

export interface ChatbotSimulationResult {
  method: string;
  platform: string;
  job_title: string;
  job_company: string;
  job_url: string;
  questions: ChatbotQuestionItem[];
  total_questions: number;
}

export interface ChatbotSubmitResult {
  success: boolean;
  messages_exchanged: number;
  data_submitted: Record<string, string>;
  verification: {
    simulated: string | null;
    live: string | null;
    match: string;
    score: number;
  }[];
  error: string | null;
  completed: boolean;
}
