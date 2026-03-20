# Changelog

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
