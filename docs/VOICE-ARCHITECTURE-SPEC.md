# Voice Architecture Spec — ARIA-Inspired Immersive Interview Experience

**Version:** 1.0  
**Status:** SPEC ONLY — NOT YET IMPLEMENTED  
**Source Reference:** `/Users/rvance/Documents/GitHub/aria` (ARIA project)  
**Target:** CareerLens Interview Simulator  
**Date:** 2025-05-05

---

## Executive Summary

This spec defines the adoption of 8 architectural patterns from the ARIA (Autonomous Responsive Interactive Assistant) project into the CareerLens Interview Simulator. The goal: transform the Interview Simulator from a manual push-to-talk interface into a **fully immersive, hands-free, real-time conversational experience** that detects speech patterns, handles interrupts, prevents echo loops, and auto-heals failures.

---

## Current State (What Exists)

| Component | Implementation | Limitations |
|-----------|---------------|-------------|
| Web Speech API STT | `use-speech-recognition.ts` — basic interim/final callbacks, `setTimeout`-based silence | No VAD, no echo cancellation, no turn detection |
| Whisper STT fallback | `use-whisper-stt.ts` — 5s chunk upload via REST | No echo guard, no overlap detection, no unified abstraction |
| Audio player (TTS) | `use-audio-player.ts` — plays URL or `speechSynthesis` | No sentence queuing, no interrupt support, no self-healing |
| Interview flow | Manual "Start Speaking" / "Done Speaking" buttons | No auto turn-taking, no interrupt detection |
| Echo prevention | None | STT picks up TTS output as user input |

---

## Target State (What We're Building)

A hands-free interview loop:
1. Interviewer asks question (TTS plays via Kokoro)
2. System auto-detects when TTS finishes and opens mic
3. System auto-detects when user starts/stops speaking (VAD)
4. System handles echo cancellation (6 layers)
5. User can interrupt interviewer mid-question
6. Interviewer can nudge if silence detected (with echo-safe timing)
7. TTS self-heals on failure
8. All STT modes unified under one abstraction

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                                   │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │  SpeechDirector  │    │   UnifiedSTT     │    │      VAD         │   │
│  │  (TTS Queue)     │    │  (Web/Whisper)   │    │  (Audio Level)   │   │
│  │                  │    │                  │    │                  │   │
│  │  - sentence split│    │  - echo filter   │    │  - RMS analysis  │   │
│  │  - play/pause    │    │  - auto fallback │    │  - speech start  │   │
│  │  - interrupt     │    │  - mode persist  │    │  - speech end    │   │
│  └───────┬──────────┘    └────────┬─────────┘    └────────┬─────────┘   │
│          │                        │                        │             │
│  ┌───────┴────────────────────────┴────────────────────────┴─────────┐  │
│  │                    TurnTakingCoordinator                            │  │
│  │                                                                    │  │
│  │  - tracks currentSpeaker (interviewer | candidate | none)          │  │
│  │  - accumulates speech, detects turn end                            │  │
│  │  - fires interrupt when candidate speaks during interviewer turn   │  │
│  └────────────────────────────────┬──────────────────────────────────┘  │
│                                   │                                      │
│  ┌────────────────────────────────┴──────────────────────────────────┐  │
│  │                    EchoCancellation (6-layer)                       │  │
│  │                                                                    │  │
│  │  L0: was-speaking-at-start flag                                    │  │
│  │  L1: isSpeaking global                                             │  │
│  │  L2: ignoreAllSpeechInput (thinking/response phase)                │  │
│  │  L3: time-based echo guard (3.5s web, 5s whisper)                  │  │
│  │  L4: recording-overlap check (recording start < TTS end)           │  │
│  │  L5: content-based word overlap (>30% match = echo)                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                   │ WebSocket
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    INTERVIEW-SIMULATOR BACKEND                            │
│                                                                          │
│  - Receives transcript (interim/final) with echo metadata                │
│  - Detects communication patterns (filler, hesitation, pace)             │
│  - Sends nudge/follow-up with timing signals                             │
│  - Sends question audio URL + text for echo comparison                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specs

### 1. Echo Cancellation System (`useEchoCancellation`)

**File:** `frontend/app/(auth)/interview-simulator/hooks/use-echo-cancellation.ts`

**Purpose:** Prevent TTS audio (interviewer question/nudge) from being transcribed as candidate speech.

**State:**
```typescript
interface EchoState {
  isSpeaking: boolean;              // TTS currently playing
  ignoreAllSpeechInput: boolean;    // Hard block during response phase
  ariaSpeakingEndTime: number;      // Timestamp when TTS stopped
  lastSpokenText: string;           // What interviewer last said (for content comparison)
  recordingStartTime: number;       // When current STT recording began
  wasSpeakingAtStart: boolean;      // Was TTS playing when recording started
}
```

**6-Layer Filter Function:**
```typescript
function shouldDiscardTranscript(text: string, state: EchoState): { discard: boolean; reason: string }
```

| Layer | Check | Guard Time |
|-------|-------|------------|
| 0 | `wasSpeakingAtStart === true` | Instant reject |
| 1 | `isSpeaking === true` | Instant reject |
| 2 | `ignoreAllSpeechInput === true` | Instant reject |
| 3 | `Date.now() - ariaSpeakingEndTime < ECHO_GUARD_MS` | 3500ms (Web Speech), 5000ms (Whisper) |
| 4 | `recordingStartTime < ariaSpeakingEndTime` | Instant reject |
| 5 | Word overlap > 30% against `lastSpokenText` | Content match |

**Integration Points:**
- `use-audio-player.ts` → sets `isSpeaking = true` on play, `false + timestamp` on end
- `use-unified-stt.ts` → calls `shouldDiscardTranscript()` before forwarding results
- `use-interview-ws.ts` → sets `ignoreAllSpeechInput = true` on "thinking" phase, stores `lastSpokenText` from question text

---

### 2. Voice Activity Detection (`useVAD`)

**File:** `frontend/app/(auth)/interview-simulator/hooks/use-vad.ts`

**Purpose:** Detect when user starts/stops speaking using audio level analysis (replace `setTimeout`-based silence detection).

**Config:**
```typescript
interface VADConfig {
  speechThreshold: number;       // dB level to trigger speech (-40 default)
  silenceDuration: number;       // ms of silence before declaring speech ended (600ms)
  minSpeechDuration: number;     // minimum ms of speech to count (200ms)
  smoothing: number;             // audio level smoothing factor (0.8)
  checkInterval: number;         // ms between level checks (50ms)
  fftSize: number;               // AnalyserNode FFT size (2048)
}
```

**API:**
```typescript
interface UseVADReturn {
  isRunning: boolean;
  isSpeaking: boolean;
  audioLevel: number;            // current smoothed dB level
  start: () => Promise<boolean>;
  stop: () => void;
  calibrate: (durationMs?: number) => Promise<{ ambient: number; threshold: number }>;
  setThreshold: (threshold: number) => void;
}
```

**Behavior:**
- Requests mic with `{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }`
- Uses `AudioContext` + `AnalyserNode` + `getByteFrequencyData()`
- Computes RMS → dB conversion every `checkInterval`ms
- Fires `onSpeechStart` when level exceeds threshold
- Fires `onSpeechEnd(durationMs)` after `silenceDuration`ms of silence (if speech was ≥ `minSpeechDuration`)
- `calibrate()` samples ambient noise for 3s, sets threshold at median + 10dB

---

### 3. Speech Director (`useSpeechDirector`)

**File:** `frontend/app/(auth)/interview-simulator/hooks/use-speech-director.ts`

**Purpose:** Queue TTS sentences for interruptible playback. Instead of playing entire interviewer response at once, split into sentences and play one at a time.

**API:**
```typescript
interface UseSpeechDirectorReturn {
  isPlaying: boolean;
  isPaused: boolean;
  currentChunkIndex: number;
  totalChunks: number;
  spokenText: string;            // text spoken so far
  remainingText: string;         // text not yet spoken
  play: (text: string, audioUrl?: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  interrupt: () => { spokenText: string; remainingText: string };
  stop: () => void;
}
```

**Behavior:**
- Splits text into sentences using regex: `/[^.!?]+[.!?]+|[^.!?]+$/g`
- If Kokoro TTS audio URL provided: plays full audio but tracks sentence boundaries via timing estimates
- If using `speechSynthesis` fallback: plays one `SpeechSynthesisUtterance` per sentence
- Between sentences: checks if interrupt was requested
- On `interrupt()`: stops playback, returns what was spoken vs. remaining (passed to backend as context)
- Sets echo cancellation state (`isSpeaking`, `lastSpokenText`) for each chunk

---

### 4. Turn-Taking Coordinator (`useTurnTaking`)

**File:** `frontend/app/(auth)/interview-simulator/hooks/use-turn-taking.ts`

**Purpose:** Automatically manage conversation flow without manual Start/Done buttons.

**Config:**
```typescript
interface TurnTakingConfig {
  turnTakingDelay: number;           // ms of silence before ending user turn (1200ms)
  maxPauseForContinuation: number;   // ms to wait for short utterance continuation (2000ms)
  allowInterrupts: boolean;          // can user interrupt interviewer? (true)
  minWordsToSend: number;            // minimum words before considering turn complete (3)
}
```

**State Machine:**
```
currentSpeaker: 'none' | 'interviewer' | 'candidate'

Transitions:
  none → interviewer:  when TTS starts playing
  interviewer → none:  when TTS finishes + echo guard expires
  none → candidate:    when VAD detects speech start
  candidate → none:    when silence exceeds turnTakingDelay AND wordCount >= minWordsToSend
  interviewer → candidate: INTERRUPT (user speaks during interviewer turn)
```

**Behavior:**
- Accumulates all interim/final transcripts while `currentSpeaker === 'candidate'`
- On turn end: sends accumulated text to backend via `ws.sendTranscriptFinal()`
- If word count < `minWordsToSend`: waits `maxPauseForContinuation` before deciding
- Replaces manual "Start Speaking" / "Done Speaking" buttons with optional voice-only mode

**UI Modes:**
- **Manual mode** (default): Keep Start/Done buttons, VAD provides visual feedback only
- **Hands-free mode** (opt-in): Removes buttons, full auto turn-taking
- User preference persisted to `localStorage`

---

### 5. Interrupt Handler (`useInterruptHandler`)

**File:** `frontend/app/(auth)/interview-simulator/hooks/use-interrupt-handler.ts`

**Purpose:** Detect when candidate interrupts interviewer mid-question and handle gracefully.

**Detection Methods:**
```typescript
interface InterruptConfig {
  volumeThreshold: number;           // dB level to trigger (-35)
  persistDuration: number;           // ms of sustained volume (300ms)
  enableVolumeInterrupt: boolean;    // detect by volume (true)
  enableWordInterrupt: boolean;      // detect by words (true)
  interruptWords: string[];          // ["actually", "wait", "sorry", "um"]
}
```

**Behavior:**
- Monitors VAD audio level during interviewer TTS playback
- If user speaks loud enough for 300ms → triggers interrupt
- If user says interrupt words → triggers interrupt immediately
- On interrupt:
  1. Calls `speechDirector.interrupt()` → stops TTS, gets remaining text
  2. Sends `ws.sendInterrupt({ spokenText, remainingText, userUtterance })` to backend
  3. Backend can: re-ask question, acknowledge interrupt, adjust pacing

**Backend Integration:**
- Backend receives interrupt context and can adjust follow-up behavior
- Shorter remaining text = user probably understood, longer = re-ask or summarize

---

### 6. Unified STT (`useUnifiedSTT`)

**File:** `frontend/app/(auth)/interview-simulator/hooks/use-unified-stt.ts`

**Purpose:** Single abstraction over Web Speech API and Whisper STT with auto-fallback, echo filtering, and mode persistence.

**API:**
```typescript
interface UseUnifiedSTTReturn {
  isListening: boolean;
  mode: 'webspeech' | 'whisper';     // current active mode
  isAvailable: boolean;
  transcript: string;
  start: () => Promise<boolean>;
  stop: () => void;
  setMode: (mode: 'webspeech' | 'whisper') => void;
  getMode: () => string;
  reset: () => void;
}
```

**Behavior:**
- On init: checks Web Speech API support and Whisper health
- Default mode: Web Speech API if Chrome/Edge, else Whisper if available
- On Whisper failure: auto-falls back to Web Speech API with user notification
- Persists mode preference to `localStorage('interview-stt-mode')`
- All transcript results pass through echo cancellation filter before forwarding
- Replaces separate `useSpeechRecognition` + `useWhisperStt` hooks

---

### 7. Self-Healing TTS (`useSelfHealingAudio`)

**File:** `frontend/app/(auth)/interview-simulator/hooks/use-self-healing-audio.ts`

**Purpose:** Wraps audio player with health monitoring, failure counting, and auto-recovery.

**State:**
```typescript
interface TTSHealthState {
  failureCount: number;
  lastSuccessTime: number;
  isRecovering: boolean;
  kokoroAvailable: boolean;
  synthAvailable: boolean;
}
```

**Config:**
```typescript
const MAX_FAILURES = 3;
const HEALTH_CHECK_INTERVAL = 30000;  // 30s
const SPEECH_TIMEOUT = 10000;         // 10s max wait for audio start
```

**Behavior:**
- Wraps `useAudioPlayer` with failure tracking
- On `play()` success: resets failure count, updates `lastSuccessTime`
- On `play()` failure: increments count, if ≥ 3 → triggers recovery
- Recovery sequence:
  1. Try Kokoro audio URL again
  2. Fall back to `speechSynthesis`
  3. Fall back to text-only display with "[Audio unavailable]" indicator
- Every 30s: checks if TTS seems unhealthy (no success in 60s + failure count > 0) → proactive recovery
- Logs diagnostic events to backend for monitoring

---

### 8. Hardware Echo Cancellation

**Integration point:** `useVAD` and `useUnifiedSTT`

Both hooks request microphone with enhanced constraints:
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
});
```

This enables browser-level AEC (Acoustic Echo Cancellation) which reduces but does not eliminate echo. The 6-layer software echo cancellation handles the remainder.

---

## Backend Changes

### New WebSocket Messages

**Server → Client (additions):**
```json
{"type": "question", "text": "...", "audio_url": "...", "question_index": 1, "total": 5}
```
Already includes `text` — echo cancellation uses this to compare against STT output.

**Client → Server (additions):**
```json
{"type": "interrupt", "spoken_text": "...", "remaining_text": "...", "user_utterance": "..."}
{"type": "speech_pattern", "event": "long_pause", "duration_ms": 5000}
{"type": "vad_event", "event": "speech_start" | "speech_end", "duration_ms": 1200}
```

**Server → Client (additions):**
```json
{"type": "interrupt_ack", "action": "continue" | "rephrase" | "skip"}
{"type": "pacing_hint", "suggestion": "take_your_time" | "wrap_up"}
```

### Communication Pattern Detection Enhancement

The backend already evaluates communication patterns. With VAD data, it can now receive:
- Exact speech duration per response (from VAD `onSpeechEnd`)
- Silence count and duration (pauses mid-response)
- Interrupt frequency (candidate interrupting questions)
- Turn-taking latency (time between question end and response start)

These feed into the Gemma 4 evaluation with richer signal.

---

## File Changes Summary

### New Files (7 hooks)
| File | Lines (est.) | Purpose |
|------|------|---------|
| `hooks/use-echo-cancellation.ts` | ~120 | 6-layer echo filter |
| `hooks/use-vad.ts` | ~180 | Voice Activity Detection via Web Audio API |
| `hooks/use-speech-director.ts` | ~150 | Sentence-level TTS queue with interrupt support |
| `hooks/use-turn-taking.ts` | ~140 | Auto turn management state machine |
| `hooks/use-interrupt-handler.ts` | ~100 | Interrupt detection during TTS playback |
| `hooks/use-unified-stt.ts` | ~160 | Unified Web Speech + Whisper with echo filter |
| `hooks/use-self-healing-audio.ts` | ~130 | Health monitoring + auto-recovery for TTS |

### Modified Files
| File | Change |
|------|--------|
| `hooks/use-audio-player.ts` | Add echo state callbacks (`onSpeakStart`, `onSpeakEnd`, `getLastSpokenText`) |
| `page.tsx` (LiveInterview) | Replace manual STT with unified hook, add hands-free mode toggle, integrate turn-taking |
| `hooks/use-interview-ws.ts` | Add interrupt message, VAD event messages, echo metadata |
| `use-whisper-stt.ts` | Add echo cancellation constraints to mic request |

### Deprecated (to remove after migration)
| File | Replaced By |
|------|-------------|
| `hooks/use-speech-recognition.ts` | `use-unified-stt.ts` |
| `hooks/use-whisper-stt.ts` | `use-unified-stt.ts` |

---

## Implementation Order

| Phase | Component | Depends On | Priority |
|-------|-----------|-----------|----------|
| **1** | `useEchoCancellation` | None | Critical — prevents self-talk |
| **2** | `useVAD` | None | High — enables all auto-detection |
| **3** | `useSelfHealingAudio` | `useEchoCancellation` | High — production reliability |
| **4** | `useSpeechDirector` | `useEchoCancellation`, `useSelfHealingAudio` | High — enables interrupts |
| **5** | `useUnifiedSTT` | `useEchoCancellation`, `useVAD` | High — replaces two hooks |
| **6** | `useTurnTaking` | `useVAD`, `useUnifiedSTT` | Medium — auto flow |
| **7** | `useInterruptHandler` | `useVAD`, `useSpeechDirector` | Medium — natural conversation |
| **8** | LiveInterview integration | All above | Final — wire everything together |

---

## UI/UX Changes

### Current: Manual Mode
```
[Start Speaking] → user talks → [Done Speaking]
```

### New: Manual Mode (default, enhanced)
```
TTS plays → echo guard → [Start Speaking] (auto-enabled after guard) → 
  VAD shows audio level bar → user talks → [Done Speaking]
```

### New: Hands-Free Mode (opt-in toggle)
```
TTS plays → echo guard expires → mic auto-opens → 
  VAD detects speech start → accumulates → 
  VAD detects silence (1.2s) → auto-sends → 
  next question TTS plays
```

### Visual Indicators
- **Audio level meter** — shows real-time mic level (VAD)
- **Echo guard countdown** — brief visual after TTS ends: "Mic activating in 3...2...1..."
- **STT mode badge** — "Web Speech" or "Whisper (server)" indicator
- **TTS health dot** — green/yellow/red for TTS status
- **Turn indicator** — "Interviewer speaking" / "Your turn" / "Processing..."

---

## Testing Strategy

### Unit Tests
- `useEchoCancellation`: Test all 6 layers independently with mock timestamps
- `useVAD`: Mock `AudioContext` + `AnalyserNode`, test threshold/timing
- `useTurnTaking`: State machine transitions with mock events
- `useSpeechDirector`: Sentence splitting, interrupt mid-queue

### Integration Tests
- Full loop: TTS plays → echo guard → STT captures → no echo detected
- Interrupt flow: TTS playing → user speaks → TTS stops → context preserved
- Fallback chain: Web Speech fails → Whisper activates → transcript received

### Manual QA
- Test with laptop speakers (high echo risk)
- Test with headphones (low echo risk)
- Test with background noise
- Test Chrome, Firefox, Safari (different STT support)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Echo guard too long → unnatural pause | UX | Tune to 2-3s, show visual countdown |
| Echo guard too short → self-talk loop | Critical | Keep 3.5s minimum, content check as backup |
| VAD too sensitive → noise triggers turn | UX | Auto-calibrate, configurable threshold |
| VAD too insensitive → misses soft speech | UX | Calibrate at start, manual fallback |
| Whisper latency → delayed transcript | UX | Keep Web Speech as primary, Whisper only for unsupported browsers |
| TTS sentence split → awkward pauses | UX | Keep splits natural (sentence boundaries only) |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Echo loops (TTS heard as user input) | Unknown (likely frequent) | 0 per session |
| Time from question end to mic ready | Manual button press | < 4s auto |
| Turn detection accuracy | N/A (manual) | > 90% correct end-of-turn |
| Interrupt response time | N/A | < 500ms to stop TTS |
| TTS recovery without page refresh | 0% | > 95% |
| Hands-free session completion rate | N/A | > 80% without touching buttons |
