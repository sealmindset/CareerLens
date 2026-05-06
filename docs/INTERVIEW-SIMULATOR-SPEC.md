# CareerLens Interview Prep — Voice Interview Simulator

## Implementation Specification

**Status:** Approved  
**Author:** Cascade  
**Date:** 2026-05-05  
**Version:** 1.2  
**Decisions finalized:** 2026-05-05

---

## 1. Overview

A voice-driven interview practice simulator that runs as its own Docker container within the CareerLens ecosystem. It generates realistic interview questions from job/company/interviewer context, conducts the interview via TTS/STT, evaluates communication quality in real-time (hesitation, filler words, trailing off, confidence), and produces a scored debrief artifact exportable to the CareerLens workspace.

### Key Differentiator

This is NOT a content evaluator — it's a **communication evaluator**. It measures *how well* you deliver, not just *what* you say. Metrics include:

- Vocal confidence signals (pace, filler word density, silence gaps)
- Response structure (clear opening, supporting details, clean close)
- Specificity (concrete examples vs. vague generalities)
- Recovery (ability to course-correct after trailing off)
- Time management (concise vs. rambling)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CareerLens Ecosystem                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌───────────────────┐     │
│  │ Frontend │───▶│ Backend  │───▶│  PostgreSQL (db)  │     │
│  │ (Next.js)│    │ (FastAPI)│    │                   │     │
│  └──────────┘    └──────────┘    └───────────────────┘     │
│       │                │                                    │
│       │                │ REST/WS                            │
│       │                ▼                                    │
│       │    ┌───────────────────────┐                       │
│       │    │  interview-simulator  │◀── NEW CONTAINER      │
│       │    │  (FastAPI + WebSocket)│                        │
│       │    └───────────┬───────────┘                       │
│       │                │                                    │
│       │                ▼                                    │
│       │    ┌───────────────────────┐                       │
│       │    │   kokoro-tts (local)  │◀── NEW CONTAINER      │
│       │    │   (OpenAI-compat API) │                        │
│       │    └───────────────────────┘                       │
│       │                                                     │
│       │    STT: Browser Web Speech API (zero cost)          │
│       │    TTS fallback: Browser speechSynthesis API        │
│       │                                                     │
└───────┼─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────┐
  │   Browser   │  ← Microphone input (STT)
  │  (Chrome/   │  ← Speaker output (TTS audio)
  │   Edge)     │  ← Real-time transcript display
  └─────────────┘
```

### Container: `interview-simulator`

| Property | Value |
|----------|-------|
| Language | Python 3.12 (FastAPI) |
| Port (internal) | 8000 |
| Port (host) | 8400 |
| Protocol | HTTP + WebSocket |
| Profile | `dev` |
| Depends on | `db`, `backend` (for auth validation) |

### Container: `kokoro-tts`

| Property | Value |
|----------|-------|
| Image | `ghcr.io/remsky/kokoro-fastapi:latest` (or build from source) |
| Port (internal) | 8880 |
| Port (host) | 8401 |
| API | OpenAI-compatible `/v1/audio/speech` |
| Profile | `dev` |
| GPU | Optional (CPU works, slower) |

---

## 3. Data Flow

### 3.1 Session Lifecycle

```
1. USER → Selects job from CareerLens (existing Job Listing)
2. USER → Chooses interview style (technical/behavioral/conversational)
3. USER → Optionally pastes interviewer LinkedIn summary
4. SIMULATOR → Generates question set (8-12 questions) via AI
5. LOOP:
   a. SIMULATOR → Speaks question via Kokoro TTS → Browser audio
   b. BROWSER → Records user response via Web Speech API STT
   c. BROWSER → Streams transcript to simulator via WebSocket
   d. SIMULATOR → Detects: silence (>5s), filler words, trailing off
   e. SIMULATOR → If stalling detected, sends nudge prompt via TTS
   f. SIMULATOR → Evaluates response (async, non-blocking)
   g. SIMULATOR → Sends next question
6. SIMULATOR → Generates scored debrief
7. USER → Exports debrief as workspace artifact
```

### 3.2 Real-Time Communication (WebSocket)

```json
// Client → Server
{"type": "transcript_interim", "text": "I think the main...", "confidence": 0.87}
{"type": "transcript_final", "text": "I think the main challenge was scaling.", "confidence": 0.95}
{"type": "silence_detected", "duration_ms": 5200}
{"type": "user_ready"}  // user signals ready for next question

// Server → Client
{"type": "question", "index": 1, "text": "Tell me about...", "audio_url": "/audio/q1.wav"}
{"type": "nudge", "text": "Take your time, would you like to continue?", "audio_url": "..."}
{"type": "evaluation_partial", "filler_count": 3, "pace": "fast", "clarity": 0.7}
{"type": "session_complete", "debrief_id": "uuid"}
```

---

## 4. Database Schema

### Table: `interview_sim_sessions`

```sql
CREATE TABLE interview_sim_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    job_title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    job_description TEXT,
    interviewer_context TEXT,  -- LinkedIn summary or notes
    interview_style VARCHAR(30) NOT NULL DEFAULT 'behavioral',  -- behavioral, technical, conversational
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, active, completed, abandoned
    question_count INT NOT NULL DEFAULT 10,
    overall_score JSONB,  -- {clarity, specificity, confidence, structure, overall}
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table: `interview_sim_questions`

```sql
CREATE TABLE interview_sim_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    session_id UUID NOT NULL REFERENCES interview_sim_sessions(id) ON DELETE CASCADE,
    question_index INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(30),  -- behavioral, technical, situational, follow_up
    expected_signals TEXT[],  -- what a good answer should contain
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table: `interview_sim_responses`

```sql
CREATE TABLE interview_sim_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    question_id UUID NOT NULL REFERENCES interview_sim_questions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES interview_sim_sessions(id) ON DELETE CASCADE,
    transcript TEXT NOT NULL,
    duration_ms INT,
    -- Communication metrics
    filler_word_count INT DEFAULT 0,
    filler_words JSONB,  -- {"um": 3, "like": 2, "you know": 1}
    silence_gaps JSONB,  -- [{start_ms, end_ms, duration_ms}]
    pace_wpm INT,  -- words per minute
    -- AI evaluation
    clarity_score FLOAT,  -- 0-1
    specificity_score FLOAT,  -- 0-1
    confidence_score FLOAT,  -- 0-1 (derived from hesitation patterns)
    structure_score FLOAT,  -- 0-1 (opening/body/close)
    example_quality VARCHAR(20),  -- none, vague, concrete, compelling
    evaluator_notes TEXT,  -- AI-generated feedback
    -- Behavioral signals
    stalled BOOLEAN DEFAULT FALSE,
    was_nudged BOOLEAN DEFAULT FALSE,
    trailing_off_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Table: `interview_sim_debriefs`

```sql
CREATE TABLE interview_sim_debriefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE,
    session_id UUID NOT NULL REFERENCES interview_sim_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Scores (0-100)
    overall_score INT,
    clarity_score INT,
    specificity_score INT,
    confidence_score INT,
    structure_score INT,
    conciseness_score INT,
    -- Qualitative
    what_landed TEXT,  -- markdown
    what_missed TEXT,  -- markdown
    portfolio_gaps TEXT,  -- markdown
    improvement_plan TEXT,  -- markdown
    -- Export
    exported_to_workspace BOOLEAN DEFAULT FALSE,
    workspace_artifact_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. AI Evaluation Engine

### 5.1 Model Selection Strategy

| Task | Preferred (Free/Local) | Fallback (Paid) |
|------|----------------------|----------------|
| Question generation | Ollama — Gemma 4 26B MoE (gemma4:26b) | Anthropic (claude-haiku) |
| Response evaluation | Ollama — Gemma 4 26B MoE (gemma4:26b) | Anthropic (claude-sonnet) |
| Debrief generation | Ollama — Gemma 4 26B MoE (gemma4:26b) | Anthropic (claude-sonnet) |
| Nudge/interrupt | Hardcoded templates | — |

The simulator will use Gemma 4 26B MoE via Ollama as the primary AI model (auto-pulled on first start).
Gemma 4 26B MoE is a Mixture-of-Experts architecture — only ~9B params active per inference, so it runs fast despite the 26B total. Requires ~16GB RAM.

Fallback order:

1. **Ollama — Gemma 4 26B MoE** (auto-pulled, zero cost) — primary
2. **MLX** (if on Apple Silicon and running) — zero cost
3. **Anthropic/OpenAI** — paid fallback

**Auto-pull on first start:** The simulator's startup checks if `gemma4:26b` is available in Ollama. If not, it pulls it automatically.

### 5.2 Communication Analysis (Rule-Based + AI Hybrid)

**Rule-based (zero-cost, real-time):**

```python
FILLER_WORDS = {"um", "uh", "like", "you know", "basically", "actually", 
                "sort of", "kind of", "I mean", "right", "so yeah"}

STALLING_SIGNALS = [
    silence_gap > 5000ms,
    filler_density > 3_per_30_words,
    repeated_phrases > 2,
    declining_pace (wpm drops 40%+),
]

CONFIDENCE_SIGNALS = {
    "negative": ["I think maybe", "I'm not sure", "probably", "I guess"],
    "positive": ["specifically", "the result was", "I led", "we achieved"],
}
```

**AI-based (per-response, async):**

```
System: You evaluate interview responses for COMMUNICATION quality only.
Score each dimension 0.0–1.0:
- clarity: Was the response easy to follow? Clear opening statement?
- specificity: Did they give concrete examples with metrics/outcomes?
- confidence: Did they sound sure of themselves? (based on transcript patterns)
- structure: Problem→Action→Result structure? Clean ending?

Also note: wrong_impression signals (humblebragging, negativity, blame, 
over-qualification signaling, desperation)
```

### 5.3 Interruption & Nudge System

| Trigger | Nudge |
|---------|-------|
| Silence > 5s | "Take your time. Would you like me to rephrase the question?" |
| Silence > 10s | "No worries — let's move to the next one if you'd prefer." |
| Trailing off (3+ incomplete sentences) | "That's a good start. Can you give me a specific example?" |
| Rambling (> 120s on one answer) | "Great detail — to be mindful of time, what was the key outcome?" |
| Filler density spike | (No vocal nudge, logged for debrief) |

---

## 6. Voice Stack

### 6.1 STT: Web Speech API (Browser-Native)

- **API:** `SpeechRecognition` / `webkitSpeechRecognition`
- **Cost:** Free
- **Browser support:** Chrome, Edge, Android Chrome (no Firefox/Safari)
- **Features used:**
  - `interimResults: true` — real-time transcript streaming
  - `continuous: true` — keeps listening until explicitly stopped
  - `lang: 'en-US'`
- **Silence detection:** Custom timer resets on each `onresult` event
- **Fallback:** If Web Speech API unavailable, falls through to Whisper STT (server-side)

### 6.1b STT Fallback: Faster-Whisper (Docker, Zero Cost)

- **Model:** faster-whisper-large-v3 (~3GB) — gold-standard accuracy (~98%)
- **Service:** `whisper-stt` container running [faster-whisper-server](https://github.com/fedirz/faster-whisper-server)
- **API:** OpenAI-compatible `POST /v1/audio/transcriptions`
- **Browser support:** All browsers (records audio via MediaRecorder, sends to server)
- **Latency:** ~2-5s per 5s audio chunk on CPU
- **Fallback chain:** Web Speech API → Whisper server → manual text input

### 6.2 TTS: Kokoro-82M (Docker, Zero Cost)

- **Model:** Kokoro-82M (~82M params, ~350MB) — extremely lightweight
- **Service:** `kokoro-tts` container running [Kokoro FastAPI](https://github.com/remsky/Kokoro-FastAPI)
- **API:** OpenAI-compatible `POST /v1/audio/speech`
- **Voices:** Multiple built-in voices (professional, warm, authoritative)
- **Output:** WAV/MP3 streamed to browser `<audio>` element
- **Latency:** ~0.5-2s for typical question on CPU (82M is very fast)
- **Fallback:** If Kokoro unavailable, use browser `speechSynthesis` API

### 6.3 Optional Audio Recording

- Uses `MediaRecorder` API to capture user's microphone audio
- Stored locally in browser (IndexedDB) — not uploaded to server
- User can replay their own responses for self-review
- Purged automatically after 7 days or on user request
- Disabled by default, toggled on in Setup

### 6.4 Voice Selection by Interview Style

| Style | Kokoro Voice | Personality |
|-------|-------------|-------------|
| Technical | `af_heart` (neutral) | Direct, asks follow-ups |
| Behavioral | `af_bella` (warm) | Encouraging, structured |
| Conversational | `am_adam` (friendly) | Casual, builds rapport |

---

## 7. Frontend Components

### 7.1 Route: `/interview-simulator`

Accessible from the CareerLens sidebar. Uses the existing auth context (OIDC cookie).

### 7.2 Pages/Views

1. **Setup View** — Job selection (from existing Job Listings via Scout), style picker, interviewer context
2. **Live Interview View** — Active Q&A with:
   - Real-time transcript (scrolling)
   - Current question display
   - Audio waveform / recording indicator
   - Timer (per question + total)
   - Progress bar (question X of Y)
   - Pause/Resume/End controls
3. **Debrief View** — Post-interview scorecard with:
   - Radar chart (clarity, specificity, confidence, structure, conciseness)
   - Per-question breakdown (expandable)
   - "What Landed" / "What Missed" / "Portfolio Gaps"
   - Suggested improvements (actionable)
   - Export to Workspace button

### 7.3 State Machine

```
SETUP → GENERATING_QUESTIONS → READY → INTERVIEWING → EVALUATING → DEBRIEF
  ↑                                         │
  └────── ABANDONED ◀───────────────────────┘
```

---

## 8. Integration Points with CareerLens

### 8.1 Job Context (Input)

- Pulls `job_title`, `company`, `job_description`, `requirements[]` from existing Job Listings via the CareerLens backend API
- Optionally pulls interviewer LinkedIn data if already scraped by Scout

### 8.2 Profile Context (Input)

- Pulls user's Profile (experience, skills, stories) to personalize questions
- Uses Story Bank entries as "expected good answers" for evaluation

### 8.3 Workspace Artifact (Output)

Exports debrief as a workspace artifact:

```python
artifact_type = "interview_sim_debrief"
agent_name = "interview_simulator"
content_format = "markdown"
```

This makes it visible alongside other agent outputs (Tailor, Coach, etc.) in Application Studio.

### 8.4 Interview Journal (Output)

Optionally creates an Interview Journal entry with:
- `entry_type = "voice_sim"`
- Linked to the application
- Stores summary + scores

---

## 9. API Endpoints (interview-simulator service)

### REST

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sim/sessions` | Create new session |
| `GET` | `/api/sim/sessions` | List user's sessions |
| `GET` | `/api/sim/sessions/{id}` | Get session details |
| `DELETE` | `/api/sim/sessions/{id}` | Delete session |
| `POST` | `/api/sim/sessions/{id}/generate-questions` | AI generates questions |
| `GET` | `/api/sim/sessions/{id}/debrief` | Get debrief |
| `POST` | `/api/sim/sessions/{id}/export` | Export to CareerLens workspace |
| `GET` | `/api/sim/audio/{filename}` | Serve TTS audio files |

### WebSocket

| Path | Description |
|------|-------------|
| `ws://host:8400/api/sim/sessions/{id}/live` | Real-time interview session |

---

## 10. Docker Compose Additions

```yaml
  # --------------------------------------------------------------------------
  # Interview Simulator (Voice Interview Practice)
  # --------------------------------------------------------------------------
  interview-simulator:
    build:
      context: ./interview-simulator
      dockerfile: Dockerfile
    ports:
      - "8400:8000"
    profiles:
      - dev
    depends_on:
      db:
        condition: service_healthy
      backend:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql+asyncpg://career-lens:career-lens@db:5432/career-lens
      - CAREERLENS_BACKEND_URL=http://backend:8000
      - KOKORO_TTS_URL=http://kokoro-tts:8880
      - AI_PROVIDER=${AI_PROVIDER:-ollama}
      - OLLAMA_BASE_URL=${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
      - OLLAMA_MODEL_STANDARD=${OLLAMA_MODEL_STANDARD:-llama3.1:8b}
      - OLLAMA_MODEL_HEAVY=${OLLAMA_MODEL_HEAVY:-llama3.1:70b}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - ANTHROPIC_MODEL_STANDARD=${ANTHROPIC_MODEL_STANDARD:-claude-sonnet-4-5}
      - JWT_SECRET=${JWT_SECRET}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks:
      - app-network

  # --------------------------------------------------------------------------
  # Kokoro TTS (Local Text-to-Speech, OpenAI-compatible API)
  # --------------------------------------------------------------------------
  kokoro-tts:
    image: ghcr.io/remsky/kokoro-fastapi:v0.2.1-cpu
    ports:
      - "8401:8880"
    profiles:
      - dev
    environment:
      - KOKORO_PORT=8880
      - KOKORO_DEFAULT_VOICE=af_bella
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8880/health')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - app-network
```

---

## 11. Directory Structure

```
/interview-simulator/
├── Dockerfile
├── requirements.txt
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app, CORS, lifespan
│   ├── config.py                  # Settings (env vars)
│   ├── auth.py                    # JWT validation (shared secret with backend)
│   ├── db.py                      # AsyncSession factory
│   ├── models/
│   │   ├── __init__.py
│   │   ├── session.py             # InterviewSimSession
│   │   ├── question.py            # InterviewSimQuestion
│   │   ├── response.py            # InterviewSimResponse
│   │   └── debrief.py             # InterviewSimDebrief
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── session.py
│   │   ├── question.py
│   │   ├── response.py
│   │   └── debrief.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── sessions.py            # CRUD endpoints
│   │   ├── live.py                # WebSocket handler
│   │   └── audio.py               # TTS audio serving
│   ├── services/
│   │   ├── __init__.py
│   │   ├── question_generator.py  # AI question generation
│   │   ├── response_evaluator.py  # Communication scoring
│   │   ├── debrief_generator.py   # Final debrief creation
│   │   ├── tts_service.py         # Kokoro TTS client
│   │   ├── nudge_engine.py        # Stalling/silence detection
│   │   └── ai_provider.py         # Ollama-first, Anthropic fallback
│   └── migrations/
│       └── 001_initial.sql
├── tests/
│   ├── test_question_generator.py
│   ├── test_evaluator.py
│   ├── test_nudge_engine.py
│   └── test_websocket.py
└── audio_cache/                   # Ephemeral TTS output files
```

### Frontend additions (in existing `/frontend`):

```
frontend/app/(auth)/interview-simulator/
├── page.tsx                        # Main page (setup + router)
├── components/
│   ├── setup-form.tsx             # Job/style/interviewer input
│   ├── live-interview.tsx         # Active interview UI
│   ├── transcript-display.tsx     # Real-time scrolling transcript
│   ├── audio-waveform.tsx         # Recording indicator
│   ├── debrief-view.tsx           # Scorecard + export
│   ├── radar-chart.tsx            # Communication scores visualization
│   └── question-progress.tsx      # Progress bar
└── hooks/
    ├── use-speech-recognition.ts  # Web Speech API wrapper
    ├── use-websocket.ts           # WS connection manager
    └── use-audio-player.ts        # TTS playback queue
```

---

## 12. Terraform Infrastructure

```
/terraform/
├── main.tf
├── variables.tf
├── outputs.tf
├── environments/
│   ├── dev.tfvars
│   ├── staging.tfvars
│   └── prod.tfvars
└── modules/
    ├── network/                   # VNet, subnets, NSGs
    ├── aks/                       # Azure Kubernetes Service
    ├── acr/                       # Azure Container Registry
    ├── postgres/                  # Azure Database for PostgreSQL Flexible
    ├── keyvault/                  # Secrets management
    ├── app-gateway/               # Ingress / load balancer
    └── monitoring/                # Log Analytics, App Insights
```

**Key resources:**

- **AKS cluster** — runs all containers (frontend, backend, simulator, kokoro)
- **ACR** — stores Docker images
- **Azure PostgreSQL Flexible** — production database
- **Key Vault** — JWT_SECRET, API keys
- **App Gateway** — TLS termination, routing
- **Entra ID App Registration** — OIDC for production auth

---

## 13. CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Backend tests
        run: |
          cd backend && pip install -r requirements.txt && pytest
      - name: Simulator tests
        run: |
          cd interview-simulator && pip install -r requirements.txt && pytest
      - name: Frontend lint + build
        run: |
          cd frontend && npm ci && npm run lint && npm run build

  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - uses: azure/docker-login@v2
        with:
          login-server: ${{ secrets.ACR_LOGIN_SERVER }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}
      - name: Build & push images
        run: |
          docker build -t $ACR/frontend:${{ github.sha }} ./frontend
          docker build -t $ACR/backend:${{ github.sha }} ./backend
          docker build -t $ACR/interview-simulator:${{ github.sha }} ./interview-simulator
          docker push $ACR/frontend:${{ github.sha }}
          docker push $ACR/backend:${{ github.sha }}
          docker push $ACR/interview-simulator:${{ github.sha }}

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: azure/aks-set-context@v3
        with:
          cluster-name: ${{ secrets.AKS_CLUSTER }}
          resource-group: ${{ secrets.AKS_RG }}
      - name: Deploy to AKS
        run: |
          kubectl set image deployment/frontend frontend=$ACR/frontend:${{ github.sha }}
          kubectl set image deployment/backend backend=$ACR/backend:${{ github.sha }}
          kubectl set image deployment/interview-simulator interview-simulator=$ACR/interview-simulator:${{ github.sha }}
```

---

## 14. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Audio data privacy | Audio is never stored server-side; STT runs in-browser. Only transcripts are persisted. |
| JWT validation | Simulator validates tokens using shared `JWT_SECRET` — same pattern as backend. |
| WebSocket auth | Token passed as query param on WS connect, validated before upgrade. |
| CORS | Simulator allows origin from `FRONTEND_URL` only. |
| Rate limiting | Max 5 concurrent sessions per user, max 20 questions per session. |
| Entra ID (prod) | OIDC flow handled by existing backend; simulator trusts JWT from backend. |

---

## 15. Implementation Phases

### Phase 1 — Core Engine (MVP)

- [ ] Interview simulator container scaffold (FastAPI + Docker)
- [ ] Database migrations (sessions, questions, responses, debriefs)
- [ ] Question generation service (Ollama → Anthropic fallback)
- [ ] WebSocket session handler
- [ ] Basic response evaluation (rule-based filler/silence detection)
- [ ] Kokoro TTS container integration
- [ ] Frontend: Setup form + live interview view
- [ ] Frontend: Web Speech API STT hook
- [ ] Frontend: Real-time transcript display

### Phase 2 — Intelligence & Polish

- [ ] AI-powered response evaluation (communication quality scoring)
- [ ] Nudge/interrupt engine (silence, stalling, rambling detection)
- [ ] Debrief generator (full markdown report)
- [ ] Frontend: Debrief view with radar chart
- [ ] Frontend: Per-question breakdown
- [ ] Export to CareerLens workspace artifact
- [ ] Interview Journal entry creation

### Phase 3 — Infrastructure & Production

- [ ] Terraform modules (AKS, ACR, PostgreSQL, Key Vault, App Gateway)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Entra ID OIDC app registration
- [ ] Helm charts / Kubernetes manifests
- [ ] Monitoring + alerting (App Insights)
- [ ] Windows Docker Desktop compatibility verification

### Phase 4 — Advanced Features

- [ ] Follow-up questions based on response quality
- [ ] Multi-round interviews (different interviewers per round)
- [ ] Comparison mode (re-take same session, compare scores)
- [ ] Voice coaching tips between questions
- [ ] Integration with Interview Prep Coach agent (use its prep as context)

---

## 16. Environment Variables (New)

```env
# Interview Simulator
INTERVIEW_SIM_PORT=8400
INTERVIEW_SIM_URL=http://interview-simulator:8000
KOKORO_TTS_URL=http://kokoro-tts:8880
KOKORO_TTS_VOICE=af_bella
INTERVIEW_SIM_MAX_QUESTIONS=20
INTERVIEW_SIM_SILENCE_THRESHOLD_MS=5000
INTERVIEW_SIM_RAMBLE_THRESHOLD_S=120
INTERVIEW_SIM_AI_PROVIDER=ollama  # ollama, anthropic, openai
```

---

## 16b. Immersive Voice Architecture (ARIA-Inspired)

**Full spec:** [`VOICE-ARCHITECTURE-SPEC.md`](VOICE-ARCHITECTURE-SPEC.md)  
**Status:** Spec complete, implementation pending

Adopts 8 architectural patterns from the ARIA (Autonomous Responsive Interactive Assistant) project to transform the Interview Simulator from manual push-to-talk into a fully immersive, hands-free conversational experience:

| # | Component | Purpose |
|---|-----------|---------|
| 1 | **Echo Cancellation (6-layer)** | Prevent TTS from being heard as user input |
| 2 | **Voice Activity Detection (VAD)** | Detect speech start/end via audio level analysis |
| 3 | **Speech Director** | Sentence-level TTS queue with interrupt support |
| 4 | **Turn-Taking Coordinator** | Auto-detect turn boundaries, eliminate manual buttons |
| 5 | **Interrupt Handler** | Detect/handle candidate interrupting mid-question |
| 6 | **Unified STT** | Single abstraction over Web Speech + Whisper with auto-fallback |
| 7 | **Self-Healing TTS** | Health monitoring + auto-recovery for audio playback |
| 8 | **Hardware Echo Cancellation** | Request mic with AEC/noise suppression constraints |

**UI Modes:**
- **Manual mode** (default): Retains Start/Done buttons, VAD adds visual feedback + echo protection
- **Hands-free mode** (opt-in): Full auto turn-taking, no buttons needed

**Implementation order:** Echo cancellation → VAD → Self-healing TTS → Speech Director → Unified STT → Turn-taking → Interrupt handler → LiveInterview integration

---

## 16c. Interviewer Persona & Cross-Session Candidate Memory

**Full spec:** [`INTERVIEWER-PERSONA-AND-CANDIDATE-MEMORY-SPEC.md`](INTERVIEWER-PERSONA-AND-CANDIDATE-MEMORY-SPEC.md)  
**Status:** Spec complete, implementation pending  
**Inspired by:** [`ai-shared-brain`](https://github.com/Jason-Cyr/ai-shared-brain) (SOUL.md + MEMORY.md pattern)

Two features that make the simulator progressively more realistic and valuable:

| Feature | Concept | Impact |
|---------|---------|--------|
| **Interviewer Persona** | Named character with personality, questioning strategy, nudge voice, and communication style per interview type | Questions feel like a real person asked them, not a textbook |
| **Candidate Memory** | Cross-session coaching memory that tracks scores, trends, recurring patterns, and AI-written coaching summary | System adapts difficulty, focuses on weak areas, shows longitudinal progress |

**Key design decisions:**
- Personas stored as managed prompts (versioned, editable in admin UI)
- Memory stored in PostgreSQL (`interview_sim_candidate_memory` table), not markdown files
- Memory influences sessions only after 3+ completions to avoid cold-start weirdness
- Coaching summary is AI-updated but user-editable (no black box)
- Scout → Interviewer gap/strength pipeline already exists; persona enhances it with in-character probing

---

## 17. Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit (simulator) | pytest | Evaluator, nudge engine, question gen |
| Unit (frontend) | vitest | Hooks, state machine |
| Integration | pytest + httpx | WebSocket session flow |
| E2E | Playwright | Full interview flow (mocked STT) |
| Load | locust | WebSocket concurrency |

---

## 18. Windows Compatibility Notes

- All containers use Linux base images (standard Docker Desktop behavior)
- No host-only features (MLX disabled, Ollama accessed via `host.docker.internal`)
- Web Speech API works in Chrome/Edge on Windows
- Kokoro TTS runs in CPU mode (no CUDA dependency required)
- Volume mounts use relative paths (no macOS-specific paths)

---

## 19. Resolved Decisions

1. **TTS model:** Kokoro-82M — lightweight (~350MB), fast on CPU
2. **AI model:** Gemma 4 26B MoE (gemma4:26b) via Ollama — auto-pulled on first start, ~16GB RAM
3. **Audio recording:** Yes — optional, stored locally in browser IndexedDB, not server-side
4. **Language:** English-only for V1
5. **Keyboard fallback:** Available but de-emphasized (defeats purpose of voice sim)
6. **STT:** Web Speech API primary → faster-whisper-large-v3 Docker fallback → keyboard input last resort
7. **STT Docker container:** `whisper-stt` (fedirz/faster-whisper-server, port 8402)

---

## 20. Success Metrics

- User can complete a full 10-question interview in < 20 minutes
- TTS latency < 3s per question (Kokoro on CPU)
- STT accuracy matches Chrome Web Speech API baseline (~95% for clear speech)
- Debrief generated within 30s of session end
- Exported artifact visible in CareerLens workspace immediately
