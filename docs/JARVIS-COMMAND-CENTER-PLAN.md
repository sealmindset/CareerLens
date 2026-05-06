# JARVIS Command Center — Implementation Plan

## Context

A J.A.R.V.I.S.-style AI assistant that transforms raw notes (e.g., "Dylan Cole reached out about Sr. App Security Engineer at Wealth Enhancement Group, 1 pm CST, MS Teams") into fully orchestrated job search actions: auto-creating job listings, applications, calendar events, and generating AI-powered meeting prep briefings that pull from Scout, Coach, Brand Advisor, Story Bank, and Talking Points. The goal is to minimize context-switching friction between "day job" and "interview mode."

---

## Phase 1: Data Foundation

### 1.1 Event Model — `backend/app/models/event.py` (new)

New `events` table with enums:
- **event_type**: initial_call, phone_screen, technical_interview, behavioral_interview, panel_interview, follow_up, offer_call, other
- **meeting_platform**: ms_teams, zoom, google_meet, phone, in_person, webex, other
- **prep_status**: not_started, in_progress, ready

Columns: `id`, `user_id` (FK users), `application_id` (FK applications, nullable — one app can have multiple events), `event_type`, `title` (auto-generated), `scheduled_at` (DateTime TZ), `timezone` (String), `duration_minutes` (default 30), `contact_name`, `contact_email`, `contact_phone`, `meeting_link`, `platform`, `location`, `prep_status` (default not_started), `raw_note` (original text), `parsed_data` (JSONB — full AI parse), `notes`, `reminder_sent` (Boolean), `created_at`, `updated_at`

### 1.2 Migration — `backend/alembic/versions/030_create_events_table.py`

- Create table + enums
- Add `events` resource permissions (view, create, edit, delete)
- Grant all to User role (following migration 029 pattern)

### 1.3 Register model in `backend/app/models/__init__.py`

Add `Event` import and to `__all__`.

### 1.4 Schemas — `backend/app/schemas/event.py` (new)

- `EventCreate`, `EventUpdate`, `EventOut` (with computed countdown_display, enriched job_title/company from linked application)
- `NoteParseRequest` — `{ raw_note: str }`
- `NoteParseResult` — extracted fields + confidence scores per field
- `NoteCreateRequest` — `{ raw_note: str, overrides: dict | None }` (user corrections)
- `MeetingPrepResponse` — aggregated prep bundle (see Phase 4)

---

## Phase 2: AI Note Parser

### 2.1 Note Parser Service — `backend/app/services/note_parser.py` (new)

Single function `parse_note(raw_note: str) -> dict` using `get_ai_provider().complete()` with a system prompt that extracts: contact_name, role_title, company, location, job_type, event_type, scheduled_time, timezone, platform, contract_details, source, additional_notes. Each field gets a confidence score (0-1).

Follow the pattern from `jobs.py` discover endpoint — direct AI call, JSON parse, clean response.

### 2.2 Managed Prompt Seed — migration `031_jarvis_prompts.py`

Seed `jarvis-note-parser` and `jarvis-shift-gears` managed prompts into the `managed_prompts` table (following pattern of migrations 020-026).

**Note Parser Prompt (jarvis-note-parser):**
```
You are JARVIS, an AI assistant for job seekers. You extract structured information
from quick notes about job search interactions.

Given a raw note, extract ALL of the following if present:
- contact_name: The person's name
- contact_email: Email if mentioned
- role_title: Job title/position
- company: Company name
- location: Work location (look for city, state, "Remote", etc.)
- job_type: full_time, contract, part_time, remote
- event_type: initial_call, phone_screen, technical_interview, etc.
- scheduled_time: Date/time mentioned (ISO format)
- timezone: Timezone mentioned or implied (default to user's preference)
- platform: MS Teams, Zoom, Google Meet, Phone, etc.
- duration_estimate: Contract duration or meeting duration if mentioned
- contract_details: "9+ Month Contract", "potential perm in 2027", etc.
- source: recruiter, referral, applied, etc.
- additional_notes: Anything else relevant

Return JSON only. Use null for fields not found. Include a confidence score
(0-1) for each extracted field.

IMPORTANT: The current date is {current_date}. When interpreting relative dates
like "tomorrow" or "next Tuesday", use this date as reference.
```

**Shift Gears Prompt (jarvis-shift-gears):**
```
You are JARVIS, a concise executive briefing system. The user is about to transition
from their day job into an interview/call. They need a quick mental reset.

Generate a "Shift Gears" briefing -- a 2-minute read that gets them mentally prepared.

## Structure

### Quick Context (30 seconds)
- Who you're talking to: {contact_name}
- Company: {company} -- {one-line company description}
- Role: {title} -- {one-line match summary}
- Format: {platform}, {duration} minutes
- Time: {scheduled_time} {timezone}

### Your Match Story (30 seconds)
- Top 3 reasons you're a fit (from Scout analysis)
- Top gap to address proactively (from gap analysis)
- Your opening angle: one sentence that frames why you're interested

### Key Talking Points (30 seconds)
- 3 stories from your bank most relevant to this role (hook lines only)
- 1 question you MUST ask that shows you've done homework
- The "leave-behind" impression you want to create

### Energy Reset (30 seconds)
- Remember: they reached out to YOU / you earned this meeting
- Shift from {current_job_context} to {interview_persona}
- One specific win from your career that proves you belong in this conversation

Keep it punchy. No fluff. This is a pre-game warmup, not a study guide.
```

---

## Phase 3: API Routes & Orchestration

### 3.1 Events Router — `backend/app/routers/events.py` (new)

Prefix: `/api/events`, all require permission `events.*`

| Endpoint | Purpose |
|----------|---------|
| `GET /` | List events (query: upcoming, days, status) |
| `GET /upcoming` | Next 5 events with countdown (for dashboard) |
| `GET /{id}` | Single event detail |
| `POST /` | Manual event creation |
| `PUT /{id}` | Update event |
| `DELETE /{id}` | Delete event |
| `POST /parse-note` | AI parse → return preview (no save) |
| `POST /from-note` | Parse + create job + application + event (one transaction) |
| `GET /{id}/prep` | Aggregate all prep materials |
| `POST /{id}/generate-prep` | Generate "Shift Gears" briefing |

### 3.2 Command Center Service — `backend/app/services/command_center.py` (new)

`create_from_note(db, user_id, raw_note, overrides)` orchestrates:
1. Parse note (or use pre-parsed overrides)
2. Find/create JobListing (fuzzy match company+title, else create with source=recruiter)
3. Find/create Application (status=interviewing)
4. Create Event linked to application
5. Create notification confirming creation
6. Optionally trigger Scout + Brand Advisor if no workspace artifacts exist

### 3.3 Register router in `backend/app/main.py`

Add `from app.routers import events` and `app.include_router(events.router)`.

### 3.4 Event Reminders — `backend/app/services/event_reminder.py` (new)

`check_upcoming_events(db)` — queries events where `scheduled_at` is within 2 hours and `reminder_sent=False`, creates `EVENT_REMINDER` notifications, sets `reminder_sent=True`.

Add `_event_reminder_loop()` to `main.py` lifespan (runs hourly, parallel to follow-up loop).

---

## Phase 4: Meeting Prep

### 4.1 Prep Aggregation — in events router `GET /{id}/prep`

Loads the event's linked application → workspace → artifacts by type:
- `job_match_analysis` (Scout), `skill_gap_report` (Scout)
- `company_brief`, `culture_analysis` (Brand Advisor)
- `interview_prep_guide`, `star_responses`, `recruiter_screen_guide` (Coach)
- `story_cheatsheet` (Talking Points)
- Story Bank stories matching company/role trigger keywords
- `shift_gears_briefing` (JARVIS) if previously generated

Returns `MeetingPrepResponse` with `prep_completeness` (0-100%) and `missing_sections` list.

### 4.2 Shift Gears Briefing — `POST /{id}/generate-prep`

AI-generated 2-minute briefing using `jarvis-shift-gears` prompt. Populated with:
- Event details (contact, time, platform)
- Scout artifacts (match + gaps)
- Brand Advisor artifacts (company intel)
- Coach artifacts (key questions + STAR bank)
- Story Bank stories (hook lines)
- Profile (current role for "shift from X to interview mode")

Saved as WorkspaceArtifact: `agent_name="jarvis"`, `artifact_type="shift_gears_briefing"`.

---

## Phase 5: Frontend

### 5.1 TypeScript Types — `frontend/lib/types.ts`

```typescript
export interface Event {
  id: string;
  user_id: string;
  application_id: string | null;
  event_type: string;
  title: string;
  scheduled_at: string;
  timezone: string;
  duration_minutes: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  meeting_link: string | null;
  platform: string | null;
  location: string | null;
  prep_status: string;
  raw_note: string | null;
  notes: string | null;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
  job_title?: string | null;
  job_company?: string | null;
  countdown_display?: string;
}

export interface NoteParseResult {
  contact_name: string | null;
  role_title: string | null;
  company: string | null;
  location: string | null;
  job_type: string | null;
  event_type: string | null;
  scheduled_time: string | null;
  timezone: string | null;
  platform: string | null;
  contract_details: string | null;
  source: string | null;
  additional_notes: string | null;
  confidence: Record<string, number>;
}

export interface MeetingPrepData {
  event: Event;
  match_analysis: string | null;
  company_brief: string | null;
  interview_prep_guide: string | null;
  star_responses: string | null;
  recruiter_screen_guide: string | null;
  story_cheatsheet: string | null;
  relevant_stories: StoryBankStory[];
  shift_gears_briefing: string | null;
  prep_completeness: number;
  missing_sections: string[];
}
```

### 5.2 Sidebar Entry — `frontend/components/sidebar.tsx`

Add between "Application Studio" and "Story Bank":
```typescript
{
  label: "Command Center",
  href: "/command-center",
  icon: CalendarClock,
  permission: { resource: "events", action: "view" },
}
```
Import `CalendarClock` from lucide-react.

### 5.3 Command Center Page — `frontend/app/(auth)/command-center/page.tsx` (new)

**Top section: Quick Note Input**
- Large textarea with JARVIS-style placeholder
- "Parse" button → calls parse-note → shows preview card with editable fields
- "Confirm & Create" → calls from-note → success toast
- Each parsed field is editable with confidence indicator (green/yellow/red dot)

**Bottom section: Event Timeline**
- Chronological cards for upcoming events
- Each card: type badge, title/company, contact, countdown, prep status dot (red/yellow/green), platform icon
- "Prep" button → navigates to `/command-center/[eventId]/prep`
- "Join" button if meeting_link exists
- Empty state: "No upcoming events. Drop a note above to get started."

### 5.4 Meeting Prep Page — `frontend/app/(auth)/command-center/[eventId]/prep/page.tsx` (new)

- **Top banner**: Event details with live countdown
- **Shift Gears card**: AI briefing prominently displayed (or "Generate Briefing" button if none)
- **Tabbed sections**: Match Analysis | Company Intel | Interview Prep | Your Stories | STAR Responses
- **Actions**: Generate/Refresh Briefing, Run Full Analysis (triggers pipeline), Mark as Ready, Open Meeting Link
- **Completeness bar**: visual indicator of how many sections have content

### 5.5 Dashboard Widget — `frontend/app/(auth)/dashboard/page.tsx` (modify)

Add "Upcoming Events" card after stat row. Calls `GET /api/events/upcoming` separately. Shows next 3 events with countdown + prep status. "View all" links to Command Center.

### 5.6 Notification Bell — `frontend/components/notification-bell.tsx` (modify)

Add `EVENT_REMINDER` to type config with Calendar icon and teal color.

---

## Files Summary

### Modified (existing)
| File | Change |
|------|--------|
| `backend/app/models/__init__.py` | Add Event import |
| `backend/app/main.py` | Add events router + event reminder loop |
| `frontend/lib/types.ts` | Add Event, NoteParseResult, MeetingPrepData |
| `frontend/components/sidebar.tsx` | Add Command Center nav item |
| `frontend/app/(auth)/dashboard/page.tsx` | Add upcoming events widget |
| `frontend/components/notification-bell.tsx` | Add EVENT_REMINDER type |

### Created (new)
| File | Purpose |
|------|---------|
| `backend/app/models/event.py` | Event model |
| `backend/app/schemas/event.py` | Event schemas |
| `backend/app/routers/events.py` | Events API |
| `backend/app/services/note_parser.py` | AI note parsing |
| `backend/app/services/command_center.py` | From-note orchestration + prep aggregation |
| `backend/app/services/event_reminder.py` | Upcoming event reminders |
| `backend/alembic/versions/030_create_events_table.py` | Events table + permissions |
| `backend/alembic/versions/031_jarvis_prompts.py` | Managed prompt seeds |
| `frontend/app/(auth)/command-center/page.tsx` | Command Center UI |
| `frontend/app/(auth)/command-center/[eventId]/prep/page.tsx` | Meeting Prep view |

## Reuse from Existing Code

| What | Where | How |
|------|-------|-----|
| AI provider | `backend/app/ai/provider.py` | `get_ai_provider().complete()` |
| Prompt loader | `backend/app/ai/prompt_loader.py` | `get_prompt(db, slug, fallback)` |
| Artifact storage | `backend/app/services/workspace_service.py` | `save_artifact()` for shift-gears briefing |
| Notifications | `backend/app/services/notification_service.py` | `create_notification()` |
| Reminder loop | `backend/app/services/follow_up_scheduler.py` | Same async loop pattern |
| Agent context | `backend/app/services/agents/base.py` | `load_agent_context()` for prep |
| Story matching | `backend/app/services/agents/tailor.py` | `_load_story_bank_for_variant()` pattern |

## Key Design Decisions

- **Separate Event model** (not extending Application): One application can have multiple interview rounds. Events are temporal; applications are lifecycle entities.
- **Parse-then-confirm** (not auto-create): Raw notes are ambiguous. Preview lets users correct before committing, building trust.
- **JARVIS as on-demand briefing** (not a pipeline agent): Shift-gears is a synthesis of existing artifacts, not new analysis. Runs only when preparing for a specific event, not on every pipeline execution.
- **meeting_link nullable**: User's note may say "I'll send a Teams link" — the link doesn't exist yet. System sets platform and shows placeholder for user to add later.

## Verification

1. Rebuild: `docker compose --profile dev up -d --build backend frontend`
2. Migration: Check backend logs for successful migration
3. DB: `SELECT * FROM events` and `SELECT resource, action FROM permissions WHERE resource='events'`
4. Parse note: POST `/api/events/parse-note` with sample text
5. From note: POST `/api/events/from-note`, verify job + application + event created
6. UI: Navigate to Command Center, drop a note, verify parse preview + confirmation
7. Prep view: Click Prep on event, verify artifact aggregation
8. Dashboard: Verify upcoming events widget
9. Reminders: Create event 1 hour from now, verify notification
