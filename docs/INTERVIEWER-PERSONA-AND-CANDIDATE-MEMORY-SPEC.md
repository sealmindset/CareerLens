# Interviewer Persona System & Cross-Session Candidate Memory

**Version:** 1.0  
**Status:** SPEC ONLY — NOT YET IMPLEMENTED  
**Inspired by:** [`ai-shared-brain`](https://github.com/Jason-Cyr/ai-shared-brain) (SOUL.md + MEMORY.md pattern)  
**Target:** CareerLens Interview Simulator + Tailor/Scout Agents  
**Date:** 2026-05-06

---

## Executive Summary

Two interconnected features that make the Interview Simulator dramatically more realistic and valuable over time:

**A. Interviewer Persona System** — Define *who* the interviewer is: personality, questioning strategy, communication style, probing rules. Transform generic questions into character-driven conversations. Also benefits Tailor and Scout agents via persona-style managed prompts.

**B. Cross-Session Candidate Memory** — Track the candidate's communication patterns across sessions. Each debrief writes a structured learning record. The next session reads it and personalizes question difficulty, coaching tone, and focus areas. The candidate gets progressively harder challenges where they're strong and targeted drills where they're weak.

Together: the interviewer *behaves* like a real person, and the system *remembers* you like a real coach.

---

## Part A: Interviewer Persona System

### The Concept (SOUL.md → Managed Prompt)

In `ai-shared-brain`, `SOUL.md` defines the agent's personality. We adapt this into a **structured persona definition** stored as a managed prompt in PostgreSQL, versioned, editable in the Prompt Management UI, and injected at three points:

1. **Question generation** — persona shapes *what* and *how* questions are asked
2. **Nudge engine** — persona shapes *how* nudges are delivered
3. **Debrief generation** — persona shapes *commentary style* in the debrief

### Persona Schema

Each interview style (`behavioral`, `technical`, `conversational`) gets a persona. Additionally, custom personas can be user-defined.

**Managed Prompt Slug Pattern:** `interviewer-persona-{style}`

```
interviewer-persona-behavioral
interviewer-persona-technical
interviewer-persona-conversational
```

**Persona Structure (stored as managed prompt content):**

```markdown
# Interviewer Persona: {Name}

## Identity
- **Name:** Sarah Chen
- **Title:** Senior Engineering Manager
- **Company Type:** Mid-size tech (Series C startup)
- **Experience:** 12 years, 200+ interviews conducted
- **Interviewing Philosophy:** "I hire for signal, not polish"

## Personality
- **Warmth:** 7/10 — professional but approachable
- **Directness:** 8/10 — asks follow-ups immediately when answers are vague
- **Patience:** 6/10 — gives 5-7 seconds of silence before nudging
- **Humor:** 3/10 — occasional light comment, mostly business
- **Challenge Level:** 7/10 — pushes candidates beyond surface answers

## Questioning Strategy
- Opens with rapport question (1 min max)
- Asks ONE question at a time, never stacks
- Uses silence as a tool — waits 5s before nudging
- Follow-up triggers:
  - Vague answer → "Can you give me a specific example?"
  - No metrics → "What was the measurable impact?"
  - No team context → "What was your specific role vs. the team's?"
  - Surface answer → "Walk me through *how* you actually did that"
- Never asks leading questions
- Never answers for the candidate
- Calibrates difficulty: easy opener → progressively harder

## Communication Style
- Sentence length: short to medium (15-25 words)
- Tone: conversational professional
- Uses candidate's name occasionally
- Active listening signals: "Got it.", "Interesting.", "Tell me more about that."
- Transition phrases: "Let's shift gears.", "Building on that—", "Different topic."
- Does NOT say: "Great question", "That's a great answer", excessive praise

## Nudge Personality
- Short silence (5s): [waits — says nothing, uses silence as a tool]
- Medium silence (8s): "Take your time — there's no wrong answer here."
- Long silence (12s): "Would it help if I rephrased that?"
- Filler word spike: [ignores — real interviewers don't comment on fillers]
- Trailing off: "You were saying — what happened next?"
- Rambling: "I want to be respectful of time — what was the key takeaway?"

## Boundaries
- Never evaluates content correctness during the interview
- Never gives away expected answers
- Never breaks character to offer coaching mid-interview
- Never comments on speech patterns (fillers, pace) during the interview
- Coaching happens ONLY in the debrief, never during
```

### Integration Points

#### 1. Question Generator (`question_generator.py`)

**Current state:** Generic system prompt `"You are an expert interview question designer"`. No personality.

**New behavior:** Persona injected into system prompt:

```python
SYSTEM_PROMPT = """You are {persona.name}, {persona.title} at a {persona.company_type}.

{persona.identity_block}

Generate interview questions in YOUR voice and style:
{persona.questioning_strategy}

Communication rules:
{persona.communication_style}

Rules:
- Questions must reflect your personality and interviewing philosophy
- Mix question types as requested
- Include follow-up probes you would naturally ask
- Return ONLY valid JSON, no markdown fences, no commentary"""
```

**Impact:** Questions go from generic textbook format to character-driven:
- Before: *"Tell me about a time you led a cross-functional team."*
- After: *"I noticed you mentioned leading the platform migration. Walk me through how you actually rallied people from different teams around that — what did the first week look like?"*

#### 2. Nudge Engine (`nudge_engine.py`)

**Current state:** Static templates: `"Take your time. Would you like me to rephrase the question?"`

**New behavior:** Nudge templates replaced with persona-driven generation. Each persona defines its own nudge voice:

```python
NUDGE_TEMPLATES = {
    # Falls back to these if persona not loaded
    "silence_short": "Take your time.",
    ...
}

def get_persona_nudge(nudge_type: str, persona: dict | None) -> str:
    if persona and "nudge_personality" in persona:
        nudge_map = persona["nudge_personality"]
        return nudge_map.get(nudge_type, NUDGE_TEMPLATES.get(nudge_type, ""))
    return NUDGE_TEMPLATES.get(nudge_type, "")
```

**Impact:**
- Technical interviewer persona might say: *"Let me put it differently — if you had to design this from scratch today, where would you start?"*
- Behavioral persona might say: *"No rush. Think about a time this came up at work — any situation counts."*

#### 3. Debrief Generator (`debrief_generator.py`)

**Current state:** Generic `"You are an expert interview coach writing a post-interview debrief"`.

**New behavior:** Persona voice carries into debrief commentary:

```python
DEBRIEF_SYSTEM_PROMPT = """You are {persona.name}, providing post-interview feedback.
Write in your natural voice — direct, specific, actionable.

Your interviewing philosophy: {persona.philosophy}

Focus on COMMUNICATION quality — how well the candidate delivered, not content correctness."""
```

**Impact:** Debrief reads like feedback from a real person, not a rubric engine.

#### 4. Note on Scout Agent Relationship

**Scout → Interviewer already works.** The existing `agent_context` pipeline feeds Scout's gaps and strengths into question generation (see `question_generator.py` → `_build_agent_context_block()`). The persona system enhances this by making the interviewer probe gaps *in character* rather than generically.

No reverse direction (Interviewer → Scout) is needed for the Interview Simulator's core mission of "it's not what you know, but how well you say it."

> **Future Scout Enhancement (separate effort, not this spec):**  
> Scout could be enhanced to "read between the lines" of job descriptions — detecting when the *stated* requirements (e.g., "RAG experience") don't match the *actual* role intent (e.g., Data Analyst, not a multi-T Architect who built RAG systems). This would improve Scout's Pipeline Investment Recommendation (`FULL_PIPELINE / QUICK_APPLY / SKIP`) and help candidates answer "should I even bother submitting?" — but it's a Scout intelligence upgrade, not an Interview Simulator feature.

### New Files

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `interview-simulator/app/services/persona_loader.py` | Load and parse persona from managed prompts, with fallback defaults | ~80 |
| `interview-simulator/app/data/personas/behavioral.md` | Default behavioral persona (Sarah Chen) | ~60 |
| `interview-simulator/app/data/personas/technical.md` | Default technical persona (David Park) | ~60 |
| `interview-simulator/app/data/personas/conversational.md` | Default conversational persona (Alex Rivera) | ~60 |

### Modified Files

| File | Change |
|------|--------|
| `question_generator.py` | Inject persona into system prompt |
| `nudge_engine.py` | Add `get_persona_nudge()`, accept persona dict |
| `debrief_generator.py` | Inject persona voice into debrief system prompt |
| `routers/live.py` | Load persona at session start, pass to question gen + nudge engine |
| `routers/sessions.py` | Load persona for question generation |

### Migration

New migration to seed 3 default interviewer persona managed prompts:

```sql
INSERT INTO managed_prompts (slug, name, description, category, agent_name, content, model_tier, temperature, max_tokens, is_active, status)
VALUES
  ('interviewer-persona-behavioral', 'Behavioral Interviewer Persona', 'Sarah Chen — warm, structured, follow-up driven', 'system', 'interview_simulator', '...', 'standard', 0.7, 4096, true, 'published'),
  ('interviewer-persona-technical', 'Technical Interviewer Persona', 'David Park — direct, precise, depth-focused', 'system', 'interview_simulator', '...', 'standard', 0.7, 4096, true, 'published'),
  ('interviewer-persona-conversational', 'Conversational Interviewer Persona', 'Alex Rivera — casual, rapport-building', 'system', 'interview_simulator', '...', 'standard', 0.7, 4096, true, 'published');
```

---

## Part B: Cross-Session Candidate Memory

### The Concept (MEMORY.md → PostgreSQL)

In `ai-shared-brain`, `MEMORY.md` accumulates insights over time and daily notes log raw session data. We adapt this into:

1. **Per-session snapshot** (daily note equivalent) — structured metrics saved automatically after each debrief
2. **Candidate memory** (MEMORY.md equivalent) — AI-generated summary that evolves across sessions, stored per user

### New Database Table: `interview_sim_candidate_memory`

```sql
CREATE TABLE interview_sim_candidate_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id BIGSERIAL UNIQUE NOT NULL,
    user_id UUID NOT NULL,

    -- Aggregated metrics (computed from all sessions)
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_questions_answered INTEGER NOT NULL DEFAULT 0,

    -- Rolling averages (last 5 sessions)
    avg_clarity FLOAT,
    avg_specificity FLOAT,
    avg_confidence FLOAT,
    avg_structure FLOAT,
    avg_conciseness FLOAT,
    avg_filler_density FLOAT,
    avg_pace_wpm INTEGER,

    -- Trend direction per metric (-1 declining, 0 flat, +1 improving)
    clarity_trend INTEGER DEFAULT 0,
    specificity_trend INTEGER DEFAULT 0,
    confidence_trend INTEGER DEFAULT 0,
    structure_trend INTEGER DEFAULT 0,
    filler_trend INTEGER DEFAULT 0,

    -- Top recurring patterns (AI-curated, updated after each session)
    strengths JSONB,           -- ["Uses concrete examples consistently", "Strong opening statements"]
    weaknesses JSONB,          -- ["Trails off under pressure", "Filler word density spikes on technical questions"]
    filler_hotspots JSONB,     -- {"technical": 0.12, "behavioral": 0.05} — filler density by question type
    stall_triggers JSONB,      -- ["system design", "conflict resolution"] — question topics that cause stalling

    -- AI-generated coaching memory (the "MEMORY.md" equivalent)
    -- This is a natural-language summary updated by AI after each session
    coaching_summary TEXT,
    -- Example:
    -- "After 7 sessions: Clarity has improved significantly (62 → 78). STAR structure is now
    --  consistent on behavioral questions but breaks down on technical scenarios. Filler words
    --  ('basically', 'you know') spike when discussing system design — likely a confidence gap.
    --  Candidate responds well to silence nudges but gets flustered by follow-up probes on
    --  metrics. Next session should focus on: (1) quantifying technical achievements,
    --  (2) structured technical storytelling, (3) handling 'walk me through how' probes."

    -- Session history snapshots (last 10 sessions, JSONB array)
    session_snapshots JSONB,
    -- [
    --   {
    --     "session_id": "...",
    --     "date": "2026-05-05",
    --     "job_title": "Senior Engineer",
    --     "style": "technical",
    --     "overall_score": 72,
    --     "scores": {"clarity": 78, "specificity": 65, "confidence": 70, "structure": 75},
    --     "filler_density": 0.08,
    --     "nudge_count": 2,
    --     "key_weakness": "No metrics on system design impact",
    --     "key_strength": "Strong opening statements"
    --   }
    -- ]

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidate_memory_user ON interview_sim_candidate_memory(user_id);
```

### Memory Update Flow

```
Session completes → Debrief generated → Memory updater runs
                                             │
                                             ├─ 1. Load existing candidate_memory (or create new)
                                             ├─ 2. Append session snapshot to session_snapshots[]
                                             ├─ 3. Recalculate rolling averages from last 5 sessions
                                             ├─ 4. Compute trends (compare last 3 vs previous 3)
                                             ├─ 5. Call AI to update coaching_summary
                                             │      Input: old coaching_summary + new session data
                                             │      Output: updated coaching_summary
                                             └─ 6. Save to DB
```

### New Service: `memory_updater.py`

```python
async def update_candidate_memory(
    db: AsyncSession,
    user_id: uuid.UUID,
    session: InterviewSimSession,
    debrief: InterviewSimDebrief,
    responses: list[InterviewSimResponse],
) -> CandidateMemory:
    """Update the candidate's cross-session memory after a completed interview."""
    ...
```

**AI Prompt for coaching_summary update:**

```
You are updating a candidate's coaching memory after their latest practice interview.

Previous coaching summary:
{existing_coaching_summary or "This is the candidate's first session."}

New session data:
- Role: {job_title} at {company} ({style} interview)
- Scores: clarity={clarity}, specificity={specificity}, confidence={confidence}, structure={structure}
- Filler density: {filler_density} ({filler_count} fillers in {word_count} words)
- Times nudged: {nudge_count}
- Key evaluator notes: {evaluator_notes_summary}

Historical trends (last 5 sessions):
{trend_summary}

Write an updated coaching summary that:
1. Notes what improved or regressed compared to previous sessions
2. Identifies persistent patterns (things that haven't changed in 3+ sessions)
3. Recommends 2-3 specific focus areas for the NEXT session
4. Is written in second person ("You've improved..." not "The candidate improved...")
5. Keep it to 150-200 words — concise, actionable, no fluff
```

### How Memory Feeds Back Into Sessions

#### Question Generation (difficulty calibration)

When generating questions for a new session, the candidate memory injects context:

```python
# In question_generator.py
agent_context["candidate_memory"] = {
    "total_sessions": memory.total_sessions,
    "avg_scores": {"clarity": memory.avg_clarity, ...},
    "stall_triggers": memory.stall_triggers,  # Topics that cause problems
    "strengths": memory.strengths,
    "weaknesses": memory.weaknesses,
}
```

**Effect on question generation prompt:**
```
Candidate has completed {total_sessions} practice sessions.
Their weak areas: {weaknesses}
Topics that cause stalling: {stall_triggers}

Calibrate difficulty:
- Include 2-3 questions targeting weak areas
- If this is session 1-3: go easy, build confidence
- If session 4+: increase challenge level, probe deeper
- Include at least one question on a stall trigger topic
```

#### Debrief (progress tracking)

The debrief generator receives memory to show longitudinal progress:

```
Candidate history (from coaching memory):
{coaching_summary}

Trends: clarity {↑/↓/→}, specificity {↑/↓/→}, confidence {↑/↓/→}, structure {↑/↓/→}

When writing the debrief, reference what improved vs. previous sessions.
If a recurring weakness persists (3+ sessions), call it out directly.
```

#### Nudge Engine (adaptive patience)

Nudge timing adapts based on candidate history:

```python
def get_adaptive_nudge_timing(memory: CandidateMemory | None) -> dict:
    if not memory or memory.total_sessions < 3:
        # New candidate — more patient
        return {"silence_short": 8000, "silence_long": 15000}
    if memory.avg_confidence and memory.avg_confidence > 75:
        # Confident candidate — shorter patience, higher expectations
        return {"silence_short": 5000, "silence_long": 10000}
    # Struggling candidate — more patient
    return {"silence_short": 10000, "silence_long": 18000}
```

### Frontend: Progress Dashboard

After enough sessions (3+), the debrief view adds a **"Progress Over Time"** section:

- **Score trend chart** — sparkline per metric across sessions
- **Coaching summary** — the AI-written memory, editable by user
- **Focus areas** — highlighted from coaching_summary
- **Session count badge** — "Session 7 of your practice journey"

### New Files

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `interview-simulator/app/models/candidate_memory.py` | SQLAlchemy model for `interview_sim_candidate_memory` | ~55 |
| `interview-simulator/app/services/memory_updater.py` | Post-debrief memory update logic + AI coaching summary | ~120 |
| `interview-simulator/app/routers/memory.py` | GET/PUT endpoints for candidate memory (read/edit coaching summary) | ~60 |
| Migration file | Create table + index | ~30 |

### Modified Files

| File | Change |
|------|--------|
| `services/question_generator.py` | Accept candidate memory context, calibrate difficulty |
| `services/debrief_generator.py` | Include memory trends in debrief prompt |
| `services/nudge_engine.py` | Adaptive nudge timing from memory |
| `routers/live.py` | Load memory at session start, call memory_updater after debrief |
| `routers/sessions.py` | Include memory summary in session detail response |
| `frontend/.../page.tsx` | Add progress section to DebriefView when memory exists |

---

## Combined Architecture Diagram

```
┌─ Session Start ──────────────────────────────────────────────────────┐
│                                                                       │
│  1. Load Interviewer Persona (managed prompt by style)                │
│  2. Load Candidate Memory (if exists, from DB)                        │
│  3. Generate questions (persona voice + memory-calibrated difficulty)  │
│                                                                       │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
┌─ Interview Loop ──────────┴──────────────────────────────────────────┐
│                                                                       │
│  Persona-voiced questions → Candidate responds → Rule + AI eval       │
│  Persona-voiced nudges → Adaptive timing from memory                  │
│                                                                       │
└───────────────────────────┬───────────────────────────────────────────┘
                            │
┌─ Post-Session ────────────┴──────────────────────────────────────────┐
│                                                                       │
│  1. Generate debrief (persona voice + memory trends)                  │
│  2. Update candidate memory:                                          │
│     a. Append session snapshot                                        │
│     b. Recalculate rolling averages + trends                          │
│     c. AI updates coaching_summary                                    │
│  3. Export to workspace (if linked to application)                     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

| Phase | Component | Depends On | Effort |
|-------|-----------|-----------|--------|
| **1** | Persona loader + 3 default personas | None | ~1 day |
| **2** | Inject persona into question_generator | Phase 1 | ~0.5 day |
| **3** | Inject persona into nudge_engine | Phase 1 | ~0.5 day |
| **4** | Inject persona into debrief_generator | Phase 1 | ~0.5 day |
| **5** | Candidate memory DB table + model | None | ~0.5 day |
| **6** | Memory updater service | Phase 5 | ~1 day |
| **7** | Wire memory into question gen + debrief | Phase 5, 6 | ~1 day |
| **8** | Adaptive nudge timing from memory | Phase 5, 6 | ~0.5 day |
| **9** | Memory REST endpoints | Phase 5, 6 | ~0.5 day |
| **10** | Frontend progress dashboard | Phase 9 | ~1 day |
**Total estimated effort:** ~7 days

---

## Testing Strategy

### Persona System
- **Unit:** Persona loader returns structured data from managed prompt content
- **Unit:** Question generator output changes tone when persona is swapped
- **Unit:** Nudge text changes per persona
- **Integration:** Full session with behavioral vs. technical persona produces detectably different question styles

### Candidate Memory
- **Unit:** Memory updater correctly appends snapshot, computes rolling averages, detects trends
- **Unit:** Trend calculation: 3+ sessions improving → trend = +1
- **Integration:** Session 1 → memory created. Session 5 → coaching summary references trends
- **Regression:** Sessions without memory (first-time user) still work identically to current behavior

### Manual QA
- Run 5 sessions with same user, verify coaching summary evolves meaningfully
- Swap interview style, verify persona voice is distinct
- Edit coaching summary in UI, verify next session respects the edit

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Coaching summary drifts / hallucinates | Trust erosion | User can read + edit it; AI gets last summary as input (not raw invention) |
| Persona makes questions too rigid | Quality | Persona is guidance not script; temperature stays at 0.7 |
| Memory makes early sessions feel generic | UX | Memory only influences sessions after 3+ completions; before that, standard behavior |
| Large coaching summaries exceed context | Cost | Cap at 200 words; oldest snapshots rotate out (keep 10) |
| User expects persona to "talk" differently in TTS | Confusion | Persona affects *content* not *voice*; TTS voice is Kokoro voice selection (already per-style) |

---

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Question variety (same role, 2 sessions) | Moderate overlap | < 15% repeated question patterns |
| Nudge naturalness (user survey) | N/A | > 70% rate nudges as "natural" |
| Session-over-session score improvement | Unknown | > 60% of users improve by session 5 |
| Coaching summary accuracy (user survey) | N/A | > 80% rate it as "accurate reflection" |
| User retention (sessions per user per month) | N/A | Avg ≥ 3 sessions/month |
