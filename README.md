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
| AI | Multi-provider abstraction (Azure AI Foundry, Anthropic, OpenAI, Ollama, MLX) |
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

> **Apple Silicon users:** You can also enable MLX to run standard/light AI tasks locally for free.
> See [MLX Local Inference](#mlx-local-inference-apple-silicon) below.

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
                                         +--> SmartRoutingProvider
                                         |      |
                                         |      +-- heavy tier --> Cloud AI (Azure/Anthropic/OpenAI)
                                         |      +-- standard/light tier --> MLX local (port 8080)
                                         |
                                         +--> mock-oidc (10190) [local dev only]
```

- **Same-origin proxy** -- Next.js proxies `/api/*` to the FastAPI backend, avoiding CORS and cookie issues
- **OIDC auth** -- Browser redirects to mock-oidc for login, backend exchanges code for tokens server-to-server
- **Database-driven RBAC** -- Roles and permissions stored in PostgreSQL, never hardcoded
- **AI provider abstraction** -- Business logic calls a generic interface; the provider is selected at runtime via `AI_PROVIDER` env var
- **Smart routing** -- When MLX is enabled, standard/light tier tasks route to local Apple Silicon inference; heavy tier always goes to cloud

## Project Structure

```
career-lens/
  backend/
    app/
      ai/                  # AI provider abstraction + agent service
        providers/         # Anthropic Foundry, Anthropic, OpenAI, Ollama, MLX
      models/              # SQLAlchemy models
      routers/             # FastAPI route handlers
      schemas/             # Pydantic request/response schemas
      services/            # Business logic (job scraper, embedding providers, etc.)
    alembic/               # Database migrations
    entrypoint.sh          # DB migration + server startup
  frontend/
    app/(auth)/            # Authenticated pages (dashboard, jobs, profile, etc.)
    components/            # Shared UI (sidebar, data-table, breadcrumbs, etc.)
    lib/                   # API client, auth hooks, types
  mock-services/
    mock-oidc/             # Local OIDC provider for development
  scripts/
    mlx-server.sh          # MLX local inference server manager (macOS host)
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

## MLX Local Inference (Apple Silicon)

Run AI tasks locally on your Mac to save cloud API tokens. The **SmartRoutingProvider** transparently routes lightweight tasks to a local MLX server while keeping complex reasoning on Claude Opus.

### How It Works

| Tier | Tasks | Where It Runs |
|------|-------|---------------|
| **Heavy** | Tailor, Strategist | Cloud (Claude Opus) -- always |
| **Standard** | Scout, Coach, Brand Advisor, ATS Predictor, etc. | Local MLX (Qwen 2.5 72B) |
| **Light** | Coordinator, classification | Local MLX (Qwen 2.5 7B) |
| **Embeddings** | RAG vector generation | Local MLX (nomic-embed-text) |

If the MLX server is down or a request fails, the system automatically falls back to the cloud provider with no user-visible interruption.

### Requirements

- Mac with Apple Silicon (M1/M2/M3/M4)
- Recommended: 64GB+ unified memory (128GB for the 72B model)
- Python 3.10+ on the macOS host (outside Docker)

### Setup

**1. Install mlx-lm on your Mac (not inside Docker)**

```bash
pip install mlx-lm
```

**2. Download models**

```bash
./scripts/mlx-server.sh download
```

This pre-downloads to `~/.cache/huggingface/` (~25GB for the 72B 4-bit model). You only need to do this once.

**3. Start the MLX server**

```bash
./scripts/mlx-server.sh start
```

The server loads the model into unified memory and listens on port 8080. First startup takes 1--3 minutes while the 72B model loads. You'll see `ready!` when it's accepting requests.

**4. Enable smart routing in your .env**

```bash
MLX_ENABLED=true
```

**5. Restart the Docker app**

```bash
docker compose --profile dev up -d --build
```

The backend logs will show: `MLX smart routing enabled (standard/light -> http://host.docker.internal:8080)`

### Does MLX Start Automatically?

**No.** The MLX server runs on the macOS host, outside Docker, and must be started manually:

```bash
./scripts/mlx-server.sh start   # before starting the Docker app
```

When `MLX_ENABLED=true` but the server isn't running, the app works normally -- all requests go to the cloud provider. Once you start the MLX server, the circuit breaker detects it within 30 seconds and begins routing locally.

### Server Management

```bash
./scripts/mlx-server.sh start      # Start the MLX server
./scripts/mlx-server.sh stop       # Stop the MLX server
./scripts/mlx-server.sh status     # Check if the server is healthy
./scripts/mlx-server.sh download   # Pre-download models for offline use
```

Logs are written to `~/.career-lens-mlx/server.log`.

### Using a Different Model

Override the model via environment variable:

```bash
# Use a smaller model (for Macs with less memory)
MLX_MODEL=mlx-community/Qwen2.5-7B-Instruct-4bit ./scripts/mlx-server.sh start

# Use a different port
MLX_PORT=9090 ./scripts/mlx-server.sh start
```

Then update `.env` to match:

```bash
MLX_MODEL_STANDARD=mlx-community/Qwen2.5-7B-Instruct-4bit
MLX_BASE_URL=http://host.docker.internal:9090
```

### MLX Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `MLX_ENABLED` | `false` | Master toggle for smart routing |
| `MLX_BASE_URL` | `http://host.docker.internal:8080` | MLX inference server URL |
| `MLX_EMBEDDING_URL` | `http://host.docker.internal:8081` | MLX embedding server URL |
| `MLX_MODEL_STANDARD` | `mlx-community/Qwen2.5-72B-Instruct-4bit` | Model for standard-tier tasks |
| `MLX_MODEL_LIGHT` | `mlx-community/Qwen2.5-7B-Instruct-4bit` | Model for light-tier tasks |
| `MLX_EMBEDDING_MODEL` | `nomic-ai/nomic-embed-text-v1.5` | Model for RAG embeddings |
| `MLX_EMBEDDING_DIMENSIONS` | `768` | Embedding vector dimensions |
| `MLX_TIMEOUT` | `600` | Request timeout in seconds |

### Memory Requirements

| Model | RAM Usage | Recommended Mac |
|-------|-----------|-----------------|
| Qwen 2.5 72B (4-bit) | ~40GB | M4 Max 64GB+ |
| Qwen 2.5 7B (4-bit) | ~4GB | Any Apple Silicon Mac |
| nomic-embed-text-v1.5 | ~0.5GB | Any Apple Silicon Mac |

### Running Without Docker

If running the backend directly with `uvicorn` (not in Docker), change the MLX URL to localhost:

```bash
MLX_BASE_URL=http://localhost:8080
MLX_EMBEDDING_URL=http://localhost:8081
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "MLX unhealthy" in logs | Run `./scripts/mlx-server.sh status` -- server may not be running |
| Slow first response | Normal -- the 72B model takes 10--30s for the first token on long prompts |
| Out of memory | Use a smaller model (`Qwen2.5-7B-Instruct-4bit`) or close other apps |
| Server won't start | Check `~/.career-lens-mlx/server.log` for errors |
| Model download fails | Ensure you have internet access and enough disk space (~25GB) |
| Requests still going to cloud | Verify `MLX_ENABLED=true` in `.env` and restart Docker |

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
