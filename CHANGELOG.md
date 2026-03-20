# Changelog

## [0.7.0] - 2026-03-19

### Added
- Experience AI Assistant on My Profile page -- inline AI panel on each experience card
- Three one-click AI actions per experience: Enhance (rewrite with impact), Suggest Improvements (actionable advice), Interview Questions (STAR-method prompts to surface accomplishments)
- Custom chat input for free-form questions about any experience entry
- POST /api/profile/experiences/{exp_id}/ai-assist endpoint with action-based routing
- Experience Enhancer agent with managed system prompt (DB-stored, editable via admin)
- AI responses rendered with rich markdown (tables, lists, code blocks)

## [0.6.0] - 2026-03-19

### Added
- Markdown rendering for agent artifacts and chat messages (react-markdown + remark-gfm)
- MarkdownContent component with styled tables, code blocks, headings, lists, blockquotes, and links
- GFM support: tables, strikethrough, task lists, and autolinks in AI-generated content

### Fixed
- Agent Workspace crash (TypeError: Q.find is not a function) caused by FastAPI route shadowing on preflight endpoint

## [0.5.0] - 2026-03-19

### Added
- Shared Agent Workspace per job application with artifact storage and versioning
- Agent Preflight System -- each agent checks required data and guides user to provide missing info
- Agent Task Runner -- run individual agents against a workspace (user-directed mode)
- Agent Pipeline -- automatic chaining (Full: Scout->Tailor->Coach->Strategist->Brand Advisor->Coordinator, Quick: Scout->Tailor->Strategist)
- 6 specialized agent task modules with concrete deliverable generation:
  - Scout: Job match analysis + skill gap report
  - Tailor: Tailored resume + keyword optimization guide
  - Coach: Interview prep guide + STAR response bank
  - Strategist: Cover letter + application strategy
  - Brand Advisor: Company brief + culture/brand alignment guide
  - Coordinator: Application checklist + follow-up plan
- Workspace context injection -- each agent receives prior agents' outputs for comprehensive analysis
- "Agent Workspace" mode on the Agents page with application selector, preflight indicators, pipeline controls, and artifact viewer
- Workspace RBAC permissions (view/create/edit/delete) granted to all roles
- Database migration 005 for agent_workspaces, workspace_artifacts, pipeline_runs tables

### Fixed
- Profile page resume upload UI: removed crash-causing undefined setResumeText call
- Profile page: drag-and-drop upload zone now visible by default (was hidden behind toggle)

## [0.4.0] - 2026-03-19

### Added
- Resume PDF/Word upload with AI-powered parsing (PyPDF2 + python-docx + AI provider)
- Drag-and-drop file upload on the Profile page (PDF, .docx, .txt)
- AI extracts headline, summary, skills, experience, and education from resume text
- Extracted data auto-populates profile fields (skills, experience, education)
- Raw resume text stored for AI agents to reference
- Upload result summary shows what was extracted (skills, experiences, educations added)
- ResumeUploadResult schema for frontend/backend contract
- apiUpload helper for file uploads in frontend API client

### Fixed
- Profile experience/education API routes now use plural paths (/experiences, /educations) matching frontend

## [0.3.0] - 2026-03-19

### Added
- Job URL scraping with AI-powered extraction (httpx + BeautifulSoup + AI provider)
- Auto-scrape: pasting a URL in the Add Job modal automatically extracts title, company, location, description, and requirements
- "Import from URL" button: one-click scrape and create job listing with extracted requirements
- POST /api/jobs/scrape endpoint (preview extracted data without saving)
- POST /api/jobs/import endpoint (scrape + create in one step)
- Auto-detection of job source from URL domain (LinkedIn, Indeed, Glassdoor, company site)
- JobScrapeResult type for frontend/backend contract
- SSL proxy tolerance for job scraping (works behind Zscaler/corporate proxies)

### Changed
- Azure AI Foundry provider now supports dual-mode auth: API key (preferred) or DefaultAzureCredential fallback
- Fixed Azure AI Foundry endpoint URL for API key authentication

## [0.2.0] - 2026-03-19

### Added
- Real AI agent responses via multi-provider abstraction (replaces placeholder responses)
- Agent service with conversation context building (last 10 messages)
- Safety preamble prepended to all system prompts at runtime (immutable, not editable)
- Prompt Management system (Tier 2) with database-stored prompts, versioning, and audit logging
- Admin UI for prompt editing with save/test/publish workflow
- Adversarial prompt testing (5 injection/jailbreak test inputs)
- Prompt validation with blocked patterns (hard reject) and warning patterns (non-blocking)
- Runtime prompt caching with 60-second TTL and invalidation on publish
- 6 seeded system prompts (one per agent) with version 1
- Prompts RBAC permissions (view/edit) granted to Super Admin and Admin roles
- "general" context type for agent conversations

### Changed
- Agent chat endpoint now calls AI provider instead of returning hardcoded placeholder
- ConversationCreate schema: agent_name now optional, context_type defaults to "general"
- Super Admin now has 27 permissions (was 25)

## [0.1.0] - 2026-03-19

### Added
- Initial project setup with FastAPI backend and Next.js frontend
- OIDC authentication with mock-oidc for local development
- Database-driven RBAC with 4 system roles (Super Admin, Admin, Pro User, User)
- Profile builder with skills, experience, and education management
- Job listing management with AI analysis placeholder
- Application pipeline tracker with status management
- AI Agent console with 6 specialized agents (Scout, Tailor, Coach, Strategist, Brand Advisor, Coordinator)
- AI provider abstraction layer supporting Azure AI Foundry, Anthropic, OpenAI, and Ollama
- Dashboard with job search statistics
- Standard UI components: DataTable, Breadcrumbs, QuickSearch, ModeToggle
- Docker Compose for local development with mock-oidc
- Seed data for immediate first-run experience
- Light/dark theme support
