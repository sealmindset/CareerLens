# CareerLens

AI-powered job application assistant that helps job seekers analyze listings, tailor resumes, prepare for interviews, and track applications -- all guided by specialized AI agents.

## What It Does

- **Profile Builder** -- Manage your skills, experience, and education in one place
- **Job Scraping** -- Paste a job URL and AI extracts the title, company, requirements, and description automatically
- **6 AI Agents** -- Each specializes in a different part of your job search:
  - **Scout** -- Analyzes job listings and identifies best matches
  - **Tailor** -- Rewrites your resume in the employer's language while staying authentic
  - **Coach** -- Interviews you to uncover hidden experience and fill gaps
  - **Strategist** -- Positions your personal brand for each role
  - **Brand Advisor** -- Researches company culture and values
  - **Coordinator** -- Helps manage your application pipeline
- **Application Tracker** -- Track status, notes, and follow-ups for every application
- **Role-Based Access** -- 4 roles (Super Admin, Admin, Pro User, User) with granular permissions
- **Prompt Management** -- Admin UI for editing AI agent prompts with versioning and audit logging

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.12, SQLAlchemy, Alembic |
| Database | PostgreSQL 16 |
| Auth | OIDC (mock-oidc for local dev) |
| AI | Multi-provider abstraction (Azure AI Foundry, Anthropic, OpenAI, Ollama) |
| Infrastructure | Docker Compose |

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Rancher Desktop)
- Git

### 1. Clone and configure

```bash
git clone https://github.com/sealmindset/CareerLens.git
cd CareerLens
cp .env.example .env
```

Edit `.env` and fill in:

```bash
# Generate a JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Configure your AI provider (pick one):

# Option A: Azure AI Foundry with API key
AI_PROVIDER=anthropic_foundry
AZURE_AI_FOUNDRY_ENDPOINT=https://your-endpoint.services.ai.azure.com/anthropic
AZURE_AI_FOUNDRY_API_KEY=your-api-key

# Option B: Azure AI Foundry with Azure CLI auth (no API key)
AI_PROVIDER=anthropic_foundry
AZURE_AI_FOUNDRY_ENDPOINT=https://your-endpoint.services.ai.azure.com/anthropic
# Leave AZURE_AI_FOUNDRY_API_KEY empty -- uses `az login` credentials

# Option C: Direct Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Option D: OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Option E: Ollama (local, free)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
```

### 2. Build and start

```bash
docker compose --profile dev up -d --build
```

### 3. Seed test users

```bash
bash scripts/seed-mock-services.sh
```

### 4. Open the app

Go to **http://localhost:3300** and sign in with one of the test users:

| User | Email | Role |
|------|-------|------|
| Admin User | admin@career-lens.local | Super Admin |
| Manager User | manager@career-lens.local | Admin |
| Pro User | pro@career-lens.local | Pro User |
| Regular User | user@career-lens.local | User |

## Architecture

```
Browser --> Next.js (3300) --proxy--> FastAPI (8300) --> PostgreSQL (5600)
                                         |
                                         +--> AI Provider (Azure/Anthropic/OpenAI/Ollama)
                                         |
                                         +--> mock-oidc (10190) [local dev only]
```

- **Same-origin proxy** -- Next.js proxies `/api/*` to the FastAPI backend, avoiding CORS and cookie issues
- **OIDC auth** -- Browser redirects to mock-oidc for login, backend exchanges code for tokens server-to-server
- **Database-driven RBAC** -- Roles and permissions stored in PostgreSQL, never hardcoded
- **AI provider abstraction** -- Business logic calls a generic interface; the provider is selected at runtime via `AI_PROVIDER` env var

## Project Structure

```
career-lens/
  backend/
    app/
      ai/                  # AI provider abstraction + agent service
        providers/         # Anthropic Foundry, Anthropic, OpenAI, Ollama
      models/              # SQLAlchemy models
      routers/             # FastAPI route handlers
      schemas/             # Pydantic request/response schemas
      services/            # Business logic (job scraper, etc.)
    alembic/               # Database migrations
    entrypoint.sh          # DB migration + server startup
  frontend/
    app/(auth)/            # Authenticated pages (dashboard, jobs, profile, etc.)
    components/            # Shared UI (sidebar, data-table, breadcrumbs, etc.)
    lib/                   # API client, auth hooks, types
  mock-services/
    mock-oidc/             # Local OIDC provider for development
  scripts/
    seed-mock-services.sh  # Seeds test users into mock-oidc
  docker-compose.yml
  .env.example
```

## Key Features

### Job URL Scraping

Paste any job listing URL and the AI extracts structured data:

- **Auto-scrape** -- Paste a URL in the Add Job modal and fields auto-fill
- **Import from URL** -- One-click button to scrape and create a job listing
- Works behind corporate SSL proxies (Zscaler, Netskope, etc.)

### AI Agents

Each agent has a managed system prompt stored in the database. Admins can edit prompts through the admin UI with:

- Version history for every edit
- Save/test/publish workflow
- Audit logging (who changed what, when)
- Safety preamble prepended at runtime (cannot be edited or bypassed)
- Adversarial prompt validation (blocks injection attempts)

### Permissions

27 granular permissions across all resources. Each API endpoint checks permissions at runtime via `require_permission(resource, action)`. The frontend hides UI elements the user doesn't have access to.

## Stopping the App

```bash
docker compose --profile dev down
```

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

## Roadmap

See [`TODO.md`](TODO.md) for planned features including:

- Resume PDF/Word upload and parsing
- LinkedIn profile import
- RAG/CAG system for resume content
- Playwright-based application form auto-fill
- Cover letter generation
- Company research integration

## License

[CC0 1.0 Universal](LICENSE)
