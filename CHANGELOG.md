# Changelog

## [0.14.1] - 2026-04-11

### Added
- **Build Profile from Variants**: "Build from Variants" button on Profile page synthesizes a master profile from all resume variants, unioning unique skills, experiences, and educations (gap-fill only -- existing data is preserved)
- AI-powered headline and summary synthesis when profile fields are blank (uses strongest phrasing across all variants)
- Auto-rebuild: profile automatically updates in the background whenever a variant's content is saved or uploaded

### Fixed
- **Application Studio**: Artifact viewer now auto-scrolls into view when selecting an analysis result, so results are no longer hidden off-screen
- **Application Studio**: Download buttons (PDF/DOCX) now show a loading spinner during download and display an error message on failure instead of silently failing

## [0.14.0] - 2026-04-09

### Added
- **Resume Variants System**: manage multiple resume versions (e.g., AI Security Lead, Director of Security, Adaptable Architect) with separate content, targeting criteria, and matching keywords
- Version control on each variant: edit, save new versions, restore previous versions, side-by-side diff comparison between any two versions
- Drag-and-drop/browse upload for each variant with AI-powered adaptive extraction that maps statements to multiple fields
- Review screen after AI extraction where user can confirm, adjust, or correct before saving
- Auto-matching engine that recommends which variant to use based on job description keywords and target role matching
- Tailor Agent integration: starts from matched variant as base, produces tailored version, then evaluates both and recommends which has a better chance of landing an interview
- Application model extended with `resume_variant_id` and `resume_type` (original vs tailored) for tracking which version was used
- Interview success tracking stats endpoint (`GET /api/resume-variants/stats`): shows applications, interview rate, and offer rate per variant
- Stats UI on Resumes page with sortable table showing which variants win the most interviews
- Resume Variants sidebar navigation, breadcrumbs, and quick search integration
- Alembic migration 013: `resume_variants` and `resume_variant_versions` tables, application FK columns, RBAC permissions

## [0.13.0] - 2026-03-21

### Added
- Per-provider AI model assignments: each provider (Foundry, Anthropic, OpenAI, Ollama) stores its own heavy/standard/light model names
- Switching AI_PROVIDER automatically switches which model names are used at runtime
- Custom tabbed AI Provider UI in Admin Settings: provider selector dropdown, Anthropic (Foundry | API Key sub-tabs), OpenAI, Ollama tabs
- Each provider tab shows connection settings + 3-column model assignment grid (Heavy/Standard/Light with color-coded tier badges)
- Active provider indicator (green dot) on provider tabs
- Alembic migration 011: adds 12 per-provider model settings, removes generic AI_MODEL_* settings, fixes endpoint URL

### Changed
- AI Provider config resolved dynamically via `Settings._model_for_tier()` property -- `settings.AI_MODEL_HEAVY/STANDARD/LIGHT` now resolve based on `AI_PROVIDER`
- Azure AI Foundry endpoint updated to `https://snapistg-scus.azure.sleepnumber.com/anthropic`
- Foundry model defaults updated to match deployment names: `cogdep-aifoundry-dev-eus2-claude-*`

### Removed
- User-facing `/settings` page and legacy `/api/settings` endpoint (replaced by `/admin/settings`)
- Generic `AI_MODEL_HEAVY/STANDARD/LIGHT` settings (replaced by per-provider model settings)
- "Settings" entry from main navigation sidebar (admin Settings link remains)

## [0.12.0] - 2026-03-20

### Added
- Database-backed application settings: all .env variables now configurable via Admin UI
- `app_settings` table stores key/value pairs with group, type, sensitivity, and restart metadata
- `app_setting_audit_logs` table tracks who changed what, when, with old/new values
- Settings service with in-memory cache (60s TTL) and .env fallback: DB value wins if set, otherwise falls back to .env, then code default
- Admin Settings page (`/admin/settings`) with tabbed interface for 7 setting groups: Database, Authentication, Security, URLs, AI Provider, RAG/Embeddings, Mock Services
- Sensitive values (API keys, secrets) masked by default with eye icon to reveal (requires edit permission)
- Settings that require server restart are tagged with "restart required" badge and show a warning banner when modified
- Bulk save: update all settings in a group at once
- Audit Log modal showing full change history with old/new value diffs
- RBAC: `app_settings.view` and `app_settings.edit` permissions granted to Super Admin and Admin roles
- Alembic migration 010: creates tables, seeds all 23 settings, adds permissions

## [0.11.0] - 2026-03-20

### Added
- AI-powered application method detection: identifies how each employer accepts applications (form, chatbot, email, redirect, ATS portal)
- Two-phase detection: instant domain-based lookup (30+ ATS/chatbot patterns) + AI-powered Playwright page analysis for unknown pages
- Application method stored on job listings: `application_method`, `application_platform`, `application_method_details` columns
- Detection runs automatically during job import (domain-only, fast) and at Auto-Fill runtime (full AI analysis if needed)
- New `POST /api/jobs/{id}/detect-method` endpoint for on-demand detection with AI page analysis
- Auto-Fill agent now dispatches to the correct handler based on detected method: chatbot driver, form analyzer, or AI-powered copy-paste guide
- AI-powered email application guide: generates subject line, email body, attachment checklist, follow-up template
- AI-powered redirect guide: generates step-by-step copy-paste data for job board redirects
- AI-powered ATS portal guide: platform-specific guides for Workday, Taleo, iCIMS, SuccessFactors, BrassRing with copy-paste data blocks
- Frontend: "Apply Method" column on jobs table with color-coded badges and icons
- Frontend: application method details shown in expanded job view
- Alembic migration 009: adds application method columns to job_listings table

### Changed
- Auto-Fill agent refactored from form-vs-chatbot to 5-method dispatch (form, chatbot, email, redirect, api_portal)
- Job scraper now includes domain-based application method detection during scrape
- Job import route stores detected application method on created listing

## [0.10.0] - 2026-03-20

### Added
- Conversational chatbot driver for Paradox.ai/Olivia-style job applications
- Chatbot driver: Playwright-based conversation automation that reads bot questions, maps them to profile data, types answers, and waits for responses
- Keyword-based question-to-field mapping with regex rules for name, phone, email, work auth, sponsorship, experience, relocation, salary, and resume
- AI fallback mapper for chatbot questions that keyword rules can't handle
- Conversation completion detection (submitted/confirmed indicators)
- Mock Olivia service: full Paradox.ai chatbot simulator with 10-step conversation state machine, API matching Paradox protocol, and interactive chat HTML page
- Auto-Fill agent now detects chatbot URLs (paradox.ai) and dispatches to chatbot driver instead of form analyzer
- Auto-Fill agent also falls back to chatbot driver when form analysis finds no fields
- Chatbot transcript artifact: markdown conversation log with data summary table
- Debug endpoints on mock-olivia for session inspection

### Changed
- Auto-Fill agent refactored to support both traditional forms and conversational chatbots
- docker-compose.yml: added mock-olivia service (port 10191, dev profile)
- Added MOCK_OLIVIA_URL environment variable to backend service

## [0.9.0] - 2026-03-20

### Added
- Auto-Fill Agent: Playwright-based job application form auto-fill
- Form analyzer service: headless Chromium navigates application URLs, extracts all form fields (inputs, textareas, selects, file uploads) with labels, types, and CSS selectors
- AI-powered field mapping: maps profile data (name, email, experience, education, skills) to detected form fields with confidence scoring
- JavaScript auto-fill script generation: creates a browser-ready script users paste into DevTools to fill forms on sites requiring login (Workday, Greenhouse, Lever, etc.)
- Script handles React/Angular change detection via native value setters and event dispatching
- Form fill plan artifact: markdown summary showing which fields will be auto-filled vs. require manual input
- Generic fill guide fallback: when Playwright can't access a page, generates a comprehensive copy-paste guide
- "Copy Script" button in artifact viewer for one-click clipboard copy of auto-fill scripts
- Code-block rendering for JavaScript artifacts (vs. markdown for other artifacts)
- Auto-Fill agent card in workspace with MousePointerClick icon
- Preflight checks: requires full profile + job listing, suggests tailored resume + cover letter

### Changed
- Backend Dockerfile: added Playwright Chromium with system dependencies (playwright install --with-deps)
- Coordinator agent now suggests Auto-Fill as next agent
- Added playwright and its Chromium browser to Docker image

## [0.8.0] - 2026-03-20

### Added
- RAG/CAG system for intelligent profile content retrieval
- pgvector extension for PostgreSQL with HNSW index for vector similarity search
- Semantic chunking of profile data (experiences, skills, education, summary, resume text)
- Abstract EmbeddingProvider interface with OpenAI (text-embedding-3-small) and keyword fallback implementations
- BM25-style keyword scoring for zero-config RAG (no API key required)
- ProfileChunk model with vector(1536) column and keyword_tokens for hybrid retrieval
- Automatic profile re-indexing on profile updates, resume uploads, and LinkedIn imports
- POST /api/profile/reindex endpoint for manual re-indexing
- RAG-enhanced agent context: agents now receive the most relevant profile sections based on job context instead of truncated full text
- Configurable RAG settings: EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, RAG_CHUNK_SIZE, RAG_CHUNK_OVERLAP, RAG_TOP_K

### Changed
- PostgreSQL image switched from postgres:16-alpine to pgvector/pgvector:pg16
- Agent context building (call_agent_ai) now uses RAG retrieval with graceful fallback to standard context
- Conversation context building (_build_application_context) also uses RAG when job context is available

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
