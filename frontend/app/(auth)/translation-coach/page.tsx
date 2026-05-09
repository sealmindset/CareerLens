"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useAudioPlayer } from "../interview-simulator/hooks/use-audio-player";
import { useUnifiedStt } from "../interview-simulator/hooks/use-unified-stt";
import { useVAD } from "../interview-simulator/hooks/use-vad";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  History,
  Languages,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  SkipForward,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranslationQuestion {
  id: string;
  category: string;
  question_text: string;
  difficulty: string;
  hint: string | null;
  sort_order: number;
}

interface FlaggedPhrase {
  original: string;
  suggested: string;
  start_idx: number;
  end_idx: number;
}

interface ScoringBreakdown {
  led_with_problem: boolean;
  business_outcome_present: boolean;
  jargon_translated: boolean;
  used_employers_language: boolean;
  quantified_impact: boolean;
}

interface TranslationAttempt {
  id: string;
  session_id: string;
  question_id: string | null;
  custom_question: string | null;
  original_answer: string;
  drift_score: number;
  signal: string;
  scoring_breakdown: ScoringBreakdown;
  flagged_phrases: FlaggedPhrase[];
  translated_version: string | null;
  coaching_note: string | null;
  created_at: string;
}

interface TranslationSession {
  id: string;
  job_description: string | null;
  started_at: string;
  completed_at: string | null;
  question_count: number;
  avg_drift_score: number | null;
  attempts: TranslationAttempt[];
}

type PageState = "setup" | "warmup" | "practice" | "summary";

const CATEGORIES = [
  { key: "experience_background", label: "Experience & Background" },
  { key: "ai_architecture", label: "AI & Architecture" },
  { key: "leadership_influence", label: "Leadership & Influence" },
];

const DIMENSION_LABELS: Record<string, { label: string; weight: string }> = {
  led_with_problem: { label: "Led with Problem", weight: "25%" },
  business_outcome_present: { label: "Business Outcome", weight: "25%" },
  jargon_translated: { label: "Jargon Translated", weight: "20%" },
  used_employers_language: { label: "Employer's Language", weight: "15%" },
  quantified_impact: { label: "Quantified Impact", weight: "15%" },
};

// ---------------------------------------------------------------------------
// Warm-Up Exercises
// ---------------------------------------------------------------------------

interface WarmupExercise {
  id: string;
  title: string;
  setup: string;
  scaffold: [string, string, string];
  tip: string;
  reflection: string;
}

const WARMUP_EXERCISES: WarmupExercise[] = [
  {
    id: "boss-recap",
    title: "The Boss Recap",
    setup: "Think of something technical you solved recently. You’re going to explain it to your boss in 60 seconds.",
    scaffold: [
      "What was the business problem? (not the technical symptom)",
      "What did you do? (one sentence, no jargon)",
      "What’s the business result? (a number, a timeline, or a risk removed)",
    ],
    tip: "Your boss doesn’t debug — they prioritize. Give them a reason to care, not a system diagram.",
    reflection: "Notice: the technical HOW wasn’t needed. Your boss heard problem → action → result. That’s the full story.",
  },
  {
    id: "before-after",
    title: "Before & After",
    setup: "Pick a project where you changed something significant. You’re going to tell the story of the transformation.",
    scaffold: [
      "What was painful or broken before? (the human cost, not the root cause)",
      "What was the turning point? (the decision, not the implementation)",
      "What’s different now? (how people’s work or lives changed)",
    ],
    tip: "The ‘before’ creates tension. The ‘after’ creates satisfaction. The turning point is YOU — that’s the story.",
    reflection: "You just told a complete arc without explaining a single technical mechanism. That’s the muscle memory you’re building.",
  },
  {
    id: "why-it-mattered",
    title: "Why It Mattered",
    setup: "Pick a technical task you completed. You already know HOW you did it. Now you’re going to practice saying WHY.",
    scaffold: [
      "Who was being affected by this problem? (a person, a team, a customer)",
      "What were they feeling or experiencing? (frustration, risk, lost time)",
      "What changed for THEM after you solved it? (not what you deployed — what they experienced)",
    ],
    tip: "When you catch yourself explaining the mechanism, stop. Pivot back to the person. Their experience IS the story.",
    reflection: "The ‘why’ makes the ‘what’ matter. When you lead with human impact, the interviewer asks for technical depth — they WANT to hear more.",
  },
  {
    id: "the-stakes",
    title: "The Stakes",
    setup: "Think of a time you had to convince leadership to invest in something technical (security, infrastructure, tooling).",
    scaffold: [
      "What was at risk if nothing changed? (in business terms: revenue, customers, reputation)",
      "What was the opportunity if they invested? (not the feature — the business unlock)",
      "What actually happened? (the outcome, in one sentence)",
    ],
    tip: "FUD says ‘we’ll get breached.’ Stakes say ‘we’re leaving $2M on the table.’ Same urgency, completely different energy.",
    reflection: "You just framed a technical investment as a business decision. This is exactly how CISOs, CFOs, and boards need to hear it.",
  },
  {
    id: "narrate-not-analyze",
    title: "Narrate, Don’t Analyze",
    setup: "Describe something you worked on today or this week. The rule: if you hear yourself explaining HOW something works, stop and pivot to WHY it matters.",
    scaffold: [
      "What were you trying to accomplish? (the goal, not the task)",
      "What made it interesting or challenging? (the tension — not the error message)",
      "Where does it go from here? (the impact, not the next sprint ticket)",
    ],
    tip: "This is the hardest exercise because it’s real-time. Your brain WILL try to explain the mechanism. Catch it. Redirect. That’s the whole practice.",
    reflection: "Every time you caught yourself mid-analysis and pivoted to impact, you just rewired a neural pathway. This gets easier with repetition.",
  },
  {
    id: "define-your-anchor",
    title: "Define Your Anchor",
    setup: "Think about your upcoming interview. You need ONE central idea that every answer reinforces — your anchoring message. Not everything you know, but the organizing principle through which people will interpret what you say.",
    scaffold: [
      "What is the ONE thing you want the interviewer to take away about you? (one sentence)",
      "Give one concrete example that proves that anchor is true (a decision you made, an outcome you drove)",
      "Now connect your anchor to what THEY care about — why does your central idea matter for their organization?",
    ],
    tip: "The anchor isn’t your resume summary. It’s the strategic lens you want every answer filtered through. ‘I build governance that lets AI scale safely’ is an anchor. ‘I have 15 years of security experience’ is a fact.",
    reflection: "You just defined the through-line for your entire interview. Every answer you give should reinforce this anchor. When a question feels off-topic, bridge back: ‘What that really comes down to is...’ and return to your central idea.",
  },
  {
    id: "headlines-first",
    title: "Headlines First",
    setup: "Think of a project or accomplishment you’d bring up in an interview. You’re going to practice the Pyramid Principle: conclusion first, then evidence. No building up to the point — start with it.",
    scaffold: [
      "State your conclusion in ONE sentence — the headline a journalist would write (e.g., ‘I cut breach response time by 70% by rebuilding our incident playbook’)",
      "Give your strongest piece of evidence — one supporting fact or example (15 seconds max)",
      "Give your second piece of evidence — one more supporting point, then stop (15 seconds max)",
    ],
    tip: "If you catch yourself saying ‘so basically what happened was...’ or ‘to give you some context...’ — you’re building up. The headline IS the context. Everything after is proof.",
    reflection: "You just practiced answer-first structure. In interviews, this is the difference between commanding attention and losing it. The interviewer heard your point in the first 5 seconds — everything after made them believe it.",
  },
  {
    id: "thirty-second-version",
    title: "The 30-Second Version",
    setup: "Pick the most complex thing you’ve worked on — the one you always over-explain. You have exactly 30 seconds. If you can’t say it in 30 seconds, you don’t know what your point is yet.",
    scaffold: [
      "What was the problem? (one sentence — no setup, no backstory)",
      "What did you do about it? (one sentence — the action, not the architecture)",
      "What was the result? (one sentence — a number or an outcome the audience cares about)",
    ],
    tip: "30 seconds is about 75 words. That’s 3 sentences. If your first instinct is ‘but I need more time to explain’ — that’s the instinct you’re training against. The 30-second version is always stronger.",
    reflection: "You just compressed a complex achievement into 3 sentences. This is your opening for any interview answer. You can always expand IF the interviewer asks for more — but most of the time, they won’t need to.",
  },
];

// ---------------------------------------------------------------------------
// Signal Badge Component
// ---------------------------------------------------------------------------

function SignalBadge({ signal }: { signal: string | null }) {
  if (!signal) return null;

  const config = {
    red: {
      icon: AlertTriangle,
      label: "TECHNICAL DRIFT",
      bg: "bg-red-500/10",
      border: "border-red-500",
      text: "text-red-500",
      shadow: "shadow-red-500/30",
      animate: "animate-pulse",
    },
    amber: {
      icon: AlertCircle,
      label: "PARTIAL TRANSLATION",
      bg: "bg-amber-500/10",
      border: "border-amber-500",
      text: "text-amber-500",
      shadow: "shadow-amber-500/30",
      animate: "",
    },
    green: {
      icon: CheckCircle2,
      label: "TRANSLATED",
      bg: "bg-green-500/10",
      border: "border-green-500",
      text: "text-green-500",
      shadow: "shadow-green-500/30",
      animate: "",
    },
  }[signal];

  if (!config) return null;
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${config.bg} ${config.border} ${config.text} ${config.shadow} shadow-lg ${config.animate} transition-all duration-700`}
    >
      <Icon className="h-5 w-5" />
      <span className="font-bold text-sm tracking-wider">{config.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drift Gauge Component
// ---------------------------------------------------------------------------

function DriftGauge({ score, signal }: { score: number; signal: string }) {
  const pct = Math.round(score * 100);
  const color =
    signal === "green" ? "bg-green-500" : signal === "amber" ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
        <span>Technical</span>
        <span className="font-bold">{pct}%</span>
        <span>Business</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio Level Meter
// ---------------------------------------------------------------------------

function AudioLevelMeter({ level, isActive }: { level: number; isActive: boolean }) {
  const bars = 20;
  const normalized = Math.max(0, Math.min(1, (level + 60) / 60));
  const activeBars = Math.round(normalized * bars);

  return (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: bars }, (_, i) => {
        const isLit = isActive && i < activeBars;
        const color =
          i > bars * 0.8 ? "bg-red-500" : i > bars * 0.6 ? "bg-amber-500" : "bg-green-500";
        return (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-all duration-75 ${
              isLit ? color : "bg-gray-700/30"
            }`}
            style={{ height: `${30 + (i / bars) * 70}%` }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flagged Phrases Overlay
// ---------------------------------------------------------------------------

function FlaggedTextOverlay({
  text,
  phrases,
}: {
  text: string;
  phrases: FlaggedPhrase[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const sorted = [...phrases]
    .filter((p) => p.start_idx >= 0)
    .sort((a, b) => a.start_idx - b.start_idx);

  const segments: { text: string; phrase?: FlaggedPhrase; idx?: number }[] = [];
  let cursor = 0;
  sorted.forEach((p, i) => {
    if (p.start_idx > cursor) {
      segments.push({ text: text.slice(cursor, p.start_idx) });
    }
    segments.push({ text: text.slice(p.start_idx, p.end_idx), phrase: p, idx: i });
    cursor = p.end_idx;
  });
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return (
    <div className="relative text-sm leading-relaxed whitespace-pre-wrap">
      {segments.map((seg, i) =>
        seg.phrase ? (
          <span key={i} className="relative inline">
            <span
              className="underline decoration-red-500 decoration-wavy decoration-2 cursor-pointer px-0.5 rounded"
              style={{ backgroundColor: "rgba(239,68,68,0.1)" }}
              onClick={() => setExpanded(expanded === seg.idx ? null : (seg.idx ?? null))}
            >
              {seg.text}
            </span>
            {expanded === seg.idx && (
              <span
                className="absolute left-0 top-full mt-1 z-20 p-3 rounded-lg border shadow-lg text-xs max-w-sm"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="font-semibold text-amber-600 mb-1">Jargon Detected</div>
                <div style={{ color: "var(--muted-foreground)" }}>
                  &ldquo;{seg.phrase.original}&rdquo;
                </div>
                <div className="mt-1 font-medium text-green-600">
                  Try: &ldquo;{seg.phrase.suggested}&rdquo;
                </div>
              </span>
            )}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TranslationCoachPage() {
  const audio = useAudioPlayer();

  // Page state
  const [pageState, setPageState] = useState<PageState>("setup");
  const [questions, setQuestions] = useState<TranslationQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [showJD, setShowJD] = useState(false);

  // Session state
  const [session, setSession] = useState<TranslationSession | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [scoring, setScoring] = useState(false);
  const [currentResult, setCurrentResult] = useState<TranslationAttempt | null>(null);
  const [attempts, setAttempts] = useState<TranslationAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const transcriptRef = useRef("");

  // Warm-up state
  const [warmupStage, setWarmupStage] = useState<1 | 2 | 3>(1);
  const [warmupExercise, setWarmupExercise] = useState<WarmupExercise | null>(null);
  const [warmupRecording, setWarmupRecording] = useState(false);
  const [warmupTranscript, setWarmupTranscript] = useState("");
  const [warmupElapsed, setWarmupElapsed] = useState(0);
  const [warmupScoring, setWarmupScoring] = useState(false);
  const [warmupResult, setWarmupResult] = useState<TranslationAttempt | null>(null);
  const warmupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // STT hook
  const stt = useUnifiedStt({
    onInterim: useCallback((text: string) => {
      setInterimText(text);
    }, []),
    onFinal: useCallback((text: string) => {
      transcriptRef.current = (transcriptRef.current + " " + text).trim();
      setLiveTranscript(transcriptRef.current);
      setInterimText("");
    }, []),
  });

  // VAD hook
  const vad = useVAD({
    silenceDuration: 2000,
    onSpeechStart: useCallback(() => {}, []),
    onSpeechEnd: useCallback(() => {}, []),
  });

  // Fetch questions on mount
  useEffect(() => {
    apiGet<TranslationQuestion[]>("/translation-coach/questions")
      .then(setQuestions)
      .catch(() => setQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, []);

  const filteredQuestions = selectedCategory
    ? questions.filter((q) => q.category === selectedCategory)
    : questions;

  // Start a session
  const startSession = async () => {
    setError(null);
    try {
      const s = await apiPost<TranslationSession>("/translation-coach/sessions", {
        job_description: jobDescription.trim() || undefined,
      });
      setSession(s);
      setAttempts([]);
      setCurrentQuestionIdx(0);
      setCurrentResult(null);
      setLiveTranscript("");
      setInterimText("");
      transcriptRef.current = "";
      setWarmupStage(1);
      setWarmupExercise(null);
      setWarmupResult(null);
      setWarmupTranscript("");
      setWarmupElapsed(0);
      setPageState("warmup");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    }
  };

  // Start recording
  const startRecording = async () => {
    setLiveTranscript("");
    setInterimText("");
    transcriptRef.current = "";
    setError(null);

    const vadOk = await vad.start();
    if (!vadOk) {
      setError("Microphone access denied. Please allow microphone access and try again.");
      return;
    }

    const sttOk = await stt.start();
    if (!sttOk) {
      vad.stop();
      setError("Speech recognition unavailable. Please use a supported browser.");
      return;
    }

    setIsRecording(true);
  };

  // Stop recording and submit
  const stopRecording = async () => {
    stt.stop();
    vad.stop();
    setIsRecording(false);

    const finalTranscript = transcriptRef.current.trim();
    if (!finalTranscript) {
      setError("No speech detected. Try again.");
      return;
    }

    await submitAnswer(finalTranscript);
  };

  // Score an answer
  const submitAnswer = async (answerText: string) => {
    if (!session) return;
    const q = filteredQuestions[currentQuestionIdx];
    if (!q) return;

    setScoring(true);
    setError(null);
    try {
      const attempt = await apiPost<TranslationAttempt>("/translation-coach/attempts", {
        session_id: session.id,
        question_id: q.id,
        original_answer: answerText,
      });
      setCurrentResult(attempt);
      setAttempts((prev) => [...prev, attempt]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setScoring(false);
    }
  };

  // Next question
  const nextQuestion = () => {
    if (currentQuestionIdx + 1 >= filteredQuestions.length) {
      endSession();
      return;
    }
    setCurrentQuestionIdx((i) => i + 1);
    setCurrentResult(null);
    setLiveTranscript("");
    setInterimText("");
    transcriptRef.current = "";
  };

  // End session
  const endSession = async () => {
    if (isRecording) {
      stt.stop();
      vad.stop();
      setIsRecording(false);
    }
    if (session) {
      try {
        const updated = await apiPut<TranslationSession>(
          `/translation-coach/sessions/${session.id}/complete`
        );
        setSession(updated);
      } catch { /* ignore */ }
    }
    setPageState("summary");
  };

  // TTS
  const speakQuestion = useCallback(
    async (text: string) => {
      try {
        const resp = await fetch("/api/translation-coach/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ text }),
        });
        if (resp.ok) {
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          await audio.play(url);
          URL.revokeObjectURL(url);
          return;
        }
      } catch { /* fallback */ }
      audio.playText(text);
    },
    [audio]
  );

  // Copy to clipboard
  const copyTranslated = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  // Warm-up recording helpers
  const startWarmupRecording = async () => {
    setWarmupTranscript("");
    setWarmupResult(null);
    setInterimText("");
    transcriptRef.current = "";
    setWarmupElapsed(0);
    setError(null);
    const vadOk = await vad.start();
    if (!vadOk) {
      setError("Microphone access denied.");
      return;
    }
    const sttOk = await stt.start();
    if (!sttOk) {
      vad.stop();
      setError("Speech recognition unavailable.");
      return;
    }
    setWarmupRecording(true);
    warmupTimerRef.current = setInterval(() => setWarmupElapsed((e) => e + 1), 1000);
  };

  const stopWarmupRecording = async () => {
    stt.stop();
    vad.stop();
    setWarmupRecording(false);
    if (warmupTimerRef.current) {
      clearInterval(warmupTimerRef.current);
      warmupTimerRef.current = null;
    }
    const finalText = transcriptRef.current.trim();
    setWarmupTranscript(finalText);

    if (!finalText || !session || !warmupExercise) return;

    setWarmupScoring(true);
    setError(null);
    try {
      const questionText = `${warmupExercise.setup}\n\nScaffold:\n1. ${warmupExercise.scaffold[0]}\n2. ${warmupExercise.scaffold[1]}\n3. ${warmupExercise.scaffold[2]}`;
      const attempt = await apiPost<TranslationAttempt>("/translation-coach/attempts", {
        session_id: session.id,
        custom_question: questionText,
        original_answer: finalText,
      });
      setWarmupResult(attempt);
      setAttempts((prev) => [...prev, attempt]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scoring failed");
    } finally {
      setWarmupScoring(false);
    }
  };

  const pickExercise = (ex: WarmupExercise) => {
    setWarmupExercise(ex);
    setWarmupResult(null);
    setWarmupTranscript("");
    setWarmupElapsed(0);
    setInterimText("");
    transcriptRef.current = "";
  };

  // Border color for transcript panel
  const borderClass = !currentResult
    ? scoring
      ? "border-purple-500/50 animate-pulse"
      : isRecording
      ? "border-purple-500 shadow-purple-500/20 shadow-lg"
      : "border-[var(--border)]"
    : currentResult.signal === "green"
    ? "border-green-500 shadow-green-500/25 shadow-lg"
    : currentResult.signal === "amber"
    ? "border-amber-500 shadow-amber-500/25 shadow-lg"
    : "border-red-500 shadow-red-500/25 shadow-lg animate-[pulse_1.5s_ease-in-out_infinite]";

  // -----------------------------------------------------------------------
  // SETUP STATE
  // -----------------------------------------------------------------------

  if (pageState === "setup") {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Languages className="h-6 w-6 text-purple-500" />
              Translation Coach
            </h1>
            <p style={{ color: "var(--muted-foreground)" }}>
              Practice speaking in business-value language. Voice-driven — no typing.
            </p>
          </div>
          <Link
            href="/translation-coach/history"
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md"
            style={{ color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
          >
            <History className="h-4 w-4" /> History
          </Link>
        </div>

        {/* Category pills */}
        <div>
          <label className="text-sm font-medium mb-2 block">Question Category</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                !selectedCategory
                  ? "bg-purple-600 text-white"
                  : "border hover:bg-purple-600/10"
              }`}
              style={selectedCategory ? { borderColor: "var(--border)", color: "var(--foreground)" } : undefined}
            >
              All ({questions.length})
            </button>
            {CATEGORIES.map((cat) => {
              const count = questions.filter((q) => q.category === cat.key).length;
              return (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === cat.key
                      ? "bg-purple-600 text-white"
                      : "border hover:bg-purple-600/10"
                  }`}
                  style={selectedCategory !== cat.key ? { borderColor: "var(--border)", color: "var(--foreground)" } : undefined}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Questions preview */}
        <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-medium mb-2">
            {filteredQuestions.length} Questions Available
          </div>
          {loadingQuestions ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading questions...
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredQuestions.map((q, i) => (
                <div
                  key={q.id}
                  className="text-sm py-1.5 px-2 rounded flex items-start gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <span className="font-mono text-xs mt-0.5 min-w-[1.5rem]" style={{ color: "var(--muted-foreground)" }}>
                    {i + 1}.
                  </span>
                  <span>{q.question_text}</span>
                  <span
                    className={`ml-auto text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                      q.difficulty === "hard"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    {q.difficulty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional JD */}
        <div>
          <button
            onClick={() => setShowJD(!showJD)}
            className="text-sm flex items-center gap-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showJD ? "rotate-90" : ""}`} />
            Optional: Paste job description (improves &ldquo;Employer&apos;s Language&rdquo; scoring)
          </button>
          {showJD && (
            <textarea
              className="mt-2 w-full rounded-lg border p-3 text-sm resize-none"
              style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)", minHeight: "100px" }}
              placeholder="Paste job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          )}
        </div>

        {/* Warm-up preview */}
        <div
          className="rounded-xl border p-4 space-y-3"
          style={{
            borderColor: "rgba(168,85,247,0.2)",
            background: "linear-gradient(to bottom right, rgba(168,85,247,0.03), rgba(99,102,241,0.03))",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-semibold">Storyteller Warm-Up</span>
          </div>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Before scored practice, you&apos;ll warm up with a narrative exercise — practice framing
            technical work as a story with 3 beats: Problem → Action → Result. This trains the shift
            from analytical troubleshooter to storyteller.
          </p>
          <div className="flex gap-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Voice check
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Narrative exercise
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Then scored practice
            </span>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">{error}</div>
        )}

        <button
          onClick={startSession}
          disabled={filteredQuestions.length === 0}
          className="w-full py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <Sparkles className="h-5 w-5" /> Start with Warm-Up ({filteredQuestions.length} questions)
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // WARMUP STATE
  // -----------------------------------------------------------------------

  if (pageState === "warmup") {
    const warmupDisplayTranscript = (warmupRecording ? liveTranscript : warmupTranscript) + (interimText ? " " + interimText : "");

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Warm-Up
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {warmupStage === 1 ? "Voice Check" : warmupStage === 2 ? "Exercise" : "Ready"}
            </span>
            <button
              onClick={() => setPageState("practice")}
              className="text-sm px-3 py-1 rounded border"
              style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
            >
              Skip to Practice
            </button>
          </div>
        </div>

        {/* Stage progress */}
        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                s <= warmupStage ? "bg-purple-600" : ""
              }`}
              style={s > warmupStage ? { background: "var(--muted)" } : undefined}
            />
          ))}
        </div>

        {/* ---- STAGE 1: Voice Check ---- */}
        {warmupStage === 1 && (
          <div
            className="rounded-xl border p-6 space-y-5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div className="text-center space-y-2">
              <div className="text-sm font-medium text-purple-500">Stage 1 — Voice Check</div>
              <p className="text-lg font-semibold">
                Say your name and the role you&apos;re interviewing for.
              </p>
              <button
                onClick={() => speakQuestion("Say your name and the role you're interviewing for.")}
                disabled={audio.isPlaying}
                className="p-1.5 rounded-md hover:bg-purple-500/10 transition-colors disabled:opacity-50 mx-auto"
                title="Read aloud"
              >
                <Volume2 className="h-4 w-4 text-purple-500" />
              </button>
            </div>

            {/* Mic + Level */}
            <div className="flex flex-col items-center gap-3">
              {warmupRecording && (
                <AudioLevelMeter level={vad.audioLevel} isActive={vad.isSpeaking} />
              )}

              {!warmupRecording ? (
                <button
                  onClick={startWarmupRecording}
                  className="px-6 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <Mic className="h-5 w-5" /> Test My Microphone
                </button>
              ) : (
                <button
                  onClick={stopWarmupRecording}
                  className="px-6 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <Square className="h-4 w-4" /> Stop
                </button>
              )}
            </div>

            {/* Transcript */}
            {(warmupTranscript || liveTranscript || (warmupRecording && interimText)) && (
              <div
                className="rounded-lg border p-4 text-sm leading-relaxed"
                style={{ borderColor: "var(--border)" }}
              >
                <span style={{ color: "var(--foreground)" }}>
                  {warmupTranscript || liveTranscript}
                </span>
                {interimText && warmupRecording && (
                  <span style={{ color: "var(--muted-foreground)" }}> {interimText}</span>
                )}
              </div>
            )}

            {/* Advance — show if any speech was captured (live or finalized) */}
            {(warmupTranscript || liveTranscript) && !warmupRecording && (
              <button
                onClick={() => {
                  setWarmupStage(2);
                  setWarmupTranscript("");
                  setWarmupResult(null);
                  setLiveTranscript("");
                  setInterimText("");
                  transcriptRef.current = "";
                }}
                className="w-full py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                <Check className="h-5 w-5" /> Sounds Good — Continue
              </button>
            )}

            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">{error}</div>
            )}
          </div>
        )}

        {/* ---- STAGE 2: Narrative Exercises ---- */}
        {warmupStage === 2 && !warmupExercise && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <div className="text-sm font-medium text-purple-500">Stage 2 — Pick an Exercise</div>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Each exercise gives you 3 beats to plan before speaking. Pick one that matches what you need today.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {WARMUP_EXERCISES.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => pickExercise(ex)}
                  className="rounded-xl border p-4 text-left hover:border-purple-500/50 transition-all group"
                  style={{
                    borderColor: "var(--border)",
                    background: "linear-gradient(to bottom right, rgba(168,85,247,0.03), rgba(99,102,241,0.03))",
                  }}
                >
                  <div className="text-sm font-semibold group-hover:text-purple-500 transition-colors">
                    {ex.title}
                  </div>
                  <div className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted-foreground)" }}>
                    {ex.setup}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {warmupStage === 2 && warmupExercise && (() => {
          const warmupBorderClass = !warmupResult
            ? warmupScoring
              ? "border-purple-500/50 animate-pulse"
              : warmupRecording
              ? "border-purple-500 shadow-purple-500/20 shadow-lg"
              : "border-[var(--border)]"
            : warmupResult.signal === "green"
            ? "border-green-500 shadow-green-500/25 shadow-lg"
            : warmupResult.signal === "amber"
            ? "border-amber-500 shadow-amber-500/25 shadow-lg"
            : "border-red-500 shadow-red-500/25 shadow-lg";

          return (
          <div className="space-y-4">
            {/* Back to menu */}
            <button
              onClick={() => {
                if (warmupRecording) {
                  stt.stop();
                  vad.stop();
                  setWarmupRecording(false);
                  if (warmupTimerRef.current) { clearInterval(warmupTimerRef.current); warmupTimerRef.current = null; }
                }
                setWarmupExercise(null);
                setWarmupResult(null);
                setWarmupTranscript("");
                setInterimText("");
                transcriptRef.current = "";
              }}
              className="text-sm flex items-center gap-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              ← Back to exercises
            </button>

            {/* Two-column layout matching practice mode */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LEFT: Scaffold + Recording */}
              <div className="space-y-4">
                {/* Exercise prompt + scaffold */}
                <div
                  className="rounded-xl border p-5 space-y-4"
                  style={{
                    borderColor: "rgba(168,85,247,0.2)",
                    background: "linear-gradient(to bottom right, rgba(168,85,247,0.03), rgba(99,102,241,0.03))",
                  }}
                >
                  <div>
                    <div className="text-sm font-medium text-purple-500 mb-1">{warmupExercise.title}</div>
                    <p className="text-sm font-semibold">{warmupExercise.setup}</p>
                  </div>

                  {/* 3-Step Scaffold */}
                  <div className="space-y-3">
                    {warmupExercise.scaffold.map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </div>
                        <p className="text-sm font-medium pt-0.5" style={{ color: "var(--foreground)" }}>
                          {step}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Coaching tip */}
                  <div
                    className="rounded-lg p-3 text-xs italic"
                    style={{ background: "rgba(168,85,247,0.05)", color: "var(--muted-foreground)" }}
                  >
                    {warmupExercise.tip}
                  </div>
                </div>

                {/* Signal badge */}
                <div className="flex justify-center min-h-[44px]">
                  {warmupResult ? (
                    <SignalBadge signal={warmupResult.signal} />
                  ) : warmupRecording ? (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-purple-500 bg-purple-500/10 text-purple-500">
                      <Mic className="h-5 w-5 animate-pulse" />
                      <span className="font-bold text-sm tracking-wider">LISTENING...</span>
                    </div>
                  ) : warmupScoring ? (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-purple-500/50 bg-purple-500/10 text-purple-500 animate-pulse">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="font-bold text-sm tracking-wider">ANALYZING...</span>
                    </div>
                  ) : null}
                </div>

                {/* Transcript / Flagged text display */}
                <div
                  className={`w-full min-h-[160px] rounded-lg border-[3px] p-4 transition-all duration-700 ${warmupBorderClass}`}
                  style={{ background: "var(--card)" }}
                >
                  {warmupResult ? (
                    <FlaggedTextOverlay
                      text={warmupResult.original_answer}
                      phrases={warmupResult.flagged_phrases || []}
                    />
                  ) : warmupDisplayTranscript.trim() ? (
                    <div className="text-sm leading-relaxed">
                      <span style={{ color: "var(--foreground)" }}>
                        {warmupRecording ? liveTranscript : warmupTranscript}
                      </span>
                      {interimText && warmupRecording && (
                        <span style={{ color: "var(--muted-foreground)" }}> {interimText}</span>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-6">
                      <Mic className="h-7 w-7 mb-2" style={{ color: "var(--muted-foreground)" }} />
                      <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Plan your three beats, then press the mic.
                      </div>
                    </div>
                  )}
                </div>

                {/* Audio level + recording controls */}
                {!warmupResult && (
                  <div className="space-y-3">
                    {warmupRecording && (
                      <div className="flex flex-col items-center gap-2">
                        <AudioLevelMeter level={vad.audioLevel} isActive={vad.isSpeaking} />
                        <div className="w-full max-w-xs">
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                            <div
                              className="h-full bg-purple-500/50 transition-all duration-1000"
                              style={{ width: `${Math.min(100, (warmupElapsed / 90) * 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-center mt-1" style={{ color: "var(--muted-foreground)" }}>
                            {warmupElapsed}s
                          </div>
                        </div>
                      </div>
                    )}

                    {!warmupRecording ? (
                      <button
                        onClick={startWarmupRecording}
                        disabled={warmupScoring}
                        className="w-full py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <Mic className="h-5 w-5" /> Start Speaking
                      </button>
                    ) : (
                      <button
                        onClick={stopWarmupRecording}
                        className="w-full py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Square className="h-4 w-4" /> Done — Score My Answer
                      </button>
                    )}
                  </div>
                )}

                {/* Post-scoring navigation */}
                {warmupResult && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setWarmupStage(3)}
                      className="flex-1 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" /> Continue to Practice
                    </button>
                    <button
                      onClick={() => {
                        setWarmupExercise(null);
                        setWarmupResult(null);
                        setWarmupTranscript("");
                        setInterimText("");
                        transcriptRef.current = "";
                      }}
                      className="px-4 py-2.5 rounded-lg border font-medium flex items-center gap-2"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                    >
                      <RefreshCw className="h-4 w-4" /> Try Another
                    </button>
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">{error}</div>
                )}
              </div>

              {/* RIGHT: AI Feedback */}
              <div className="space-y-4">
                {warmupResult ? (
                  <>
                    {/* Drift Gauge */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <div className="text-sm font-medium mb-3">Drift Score</div>
                      <DriftGauge score={warmupResult.drift_score} signal={warmupResult.signal} />
                    </div>

                    {/* Scoring Breakdown */}
                    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <div className="text-sm font-medium mb-3">Scoring Breakdown</div>
                      <div className="space-y-2">
                        {Object.entries(warmupResult.scoring_breakdown).map(([key, val]) => {
                          const dim = DIMENSION_LABELS[key];
                          if (!dim) return null;
                          return (
                            <div key={key} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                {val ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <X className="h-4 w-4 text-red-500" />
                                )}
                                <span>{dim.label}</span>
                              </div>
                              <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                                {dim.weight}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Flagged Phrases */}
                    {warmupResult.flagged_phrases && warmupResult.flagged_phrases.length > 0 && (
                      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="text-sm font-medium mb-3">
                          Flagged Phrases ({warmupResult.flagged_phrases.length})
                        </div>
                        <div className="space-y-2">
                          {warmupResult.flagged_phrases.map((fp, i) => (
                            <div
                              key={i}
                              className="rounded-md border p-2.5 text-sm"
                              style={{ borderColor: "var(--border)", background: "rgba(239,68,68,0.03)" }}
                            >
                              <div className="text-red-500 font-medium">&ldquo;{fp.original}&rdquo;</div>
                              <div className="mt-1 text-green-600">→ &ldquo;{fp.suggested}&rdquo;</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Coaching Note */}
                    {warmupResult.coaching_note && (
                      <div
                        className="rounded-lg border-l-4 border-purple-500 p-4 text-sm"
                        style={{ background: "var(--card)" }}
                      >
                        <div className="font-medium text-purple-600 mb-1">Coaching</div>
                        <p style={{ color: "var(--foreground)" }}>{warmupResult.coaching_note}</p>
                      </div>
                    )}

                    {/* Exercise Reflection */}
                    <div
                      className="rounded-lg border-l-4 border-indigo-500 p-4 text-sm"
                      style={{ background: "rgba(99,102,241,0.05)" }}
                    >
                      <div className="font-medium text-indigo-500 mb-1">Narrative Principle</div>
                      <p style={{ color: "var(--foreground)" }}>{warmupExercise.reflection}</p>
                    </div>

                    {/* Translated Version */}
                    {warmupResult.translated_version && (
                      <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-green-600">How to Say This Instead</div>
                          <button
                            onClick={() => copyTranslated(warmupResult.translated_version!)}
                            className="text-xs flex items-center gap-1 px-2 py-1 rounded border hover:bg-green-500/10 transition-colors"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <ClipboardCopy className="h-3 w-3" />
                            {copiedToast ? "Copied!" : "Use This Framing"}
                          </button>
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                          {warmupResult.translated_version}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className="rounded-lg border border-dashed p-8 flex flex-col items-center justify-center text-center"
                    style={{ borderColor: "var(--border)", minHeight: "300px" }}
                  >
                    <Sparkles className="h-10 w-10 mb-3" style={{ color: "var(--muted-foreground)" }} />
                    <div className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                      Speak your response using the 3-beat scaffold, then your feedback will appear here.
                    </div>
                    <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                      Same scoring as practice — drift score, flagged phrases, coaching, and a translated version.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {/* ---- STAGE 3: Mindset Bridge ---- */}
        {warmupStage === 3 && (
          <div
            className="rounded-xl border p-6 space-y-5"
            style={{ borderColor: "rgba(168,85,247,0.2)", background: "var(--card)" }}
          >
            <div className="text-center">
              <div className="text-sm font-medium text-purple-500 mb-2">Ready — Storyteller Mode</div>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Every answer follows the same three beats:
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              {[
                { num: 1, label: "The Problem", desc: "What was the business pain? (not the technical symptom)" },
                { num: 2, label: "The Action", desc: "What did you do? (one sentence, plain language)" },
                { num: 3, label: "The Result", desc: "What changed? (a number, a timeline, or a risk removed)" },
              ].map((beat) => (
                <div key={beat.num} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold">
                    {beat.num}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{beat.label}</div>
                    <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>{beat.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div
              className="text-sm text-center italic"
              style={{ color: "var(--muted-foreground)" }}
            >
              When the analytical brain pulls you into the weeds, glance at these three beats. That&apos;s your anchor.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPageState("practice")}
                className="flex-1 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="h-5 w-5" /> Begin Practice
              </button>
              <button
                onClick={() => {
                  setWarmupStage(2);
                  setWarmupExercise(null);
                  setWarmupResult(null);
                  setWarmupTranscript("");
                  setInterimText("");
                  transcriptRef.current = "";
                }}
                className="px-4 py-3 rounded-lg border font-medium flex items-center gap-2"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                <RefreshCw className="h-4 w-4" /> One More Exercise
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // PRACTICE STATE
  // -----------------------------------------------------------------------

  if (pageState === "practice") {
    const currentQ = filteredQuestions[currentQuestionIdx];
    const isLast = currentQuestionIdx + 1 >= filteredQuestions.length;
    const displayTranscript = liveTranscript + (interimText ? " " + interimText : "");

    return (
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Languages className="h-5 w-5 text-purple-500" />
            Translation Coach
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Question {currentQuestionIdx + 1} of {filteredQuestions.length}
            </span>
            <button
              onClick={endSession}
              className="text-sm px-3 py-1 rounded border"
              style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
            >
              End Session
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
          <div
            className="h-full bg-purple-600 transition-all duration-500"
            style={{ width: `${((currentQuestionIdx + (currentResult ? 1 : 0)) / filteredQuestions.length) * 100}%` }}
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Question + Voice Recording + Transcript */}
          <div className="space-y-4">
            {/* Question */}
            <div
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                  {CATEGORIES.find((c) => c.key === currentQ?.category)?.label}
                </div>
                <button
                  onClick={() => currentQ && speakQuestion(currentQ.question_text)}
                  disabled={audio.isPlaying || isRecording}
                  className="p-1.5 rounded-md hover:bg-purple-500/10 transition-colors disabled:opacity-50"
                  title="Read question aloud"
                >
                  <Volume2 className="h-4 w-4 text-purple-500" />
                </button>
              </div>
              <p className="text-lg font-semibold mt-2">{currentQ?.question_text}</p>
              {currentQ?.hint && (
                <p className="text-xs mt-2 italic" style={{ color: "var(--muted-foreground)" }}>
                  Hint: {currentQ.hint}
                </p>
              )}
            </div>

            {/* Signal badge */}
            <div className="flex justify-center min-h-[44px]">
              {currentResult ? (
                <SignalBadge signal={currentResult.signal} />
              ) : isRecording ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-purple-500 bg-purple-500/10 text-purple-500">
                  <Mic className="h-5 w-5 animate-pulse" />
                  <span className="font-bold text-sm tracking-wider">LISTENING...</span>
                </div>
              ) : null}
            </div>

            {/* Transcript / Flagged text display */}
            <div
              className={`w-full min-h-[200px] rounded-lg border-[3px] p-4 transition-all duration-700 ${borderClass}`}
              style={{ background: "var(--card)" }}
            >
              {currentResult ? (
                <FlaggedTextOverlay
                  text={currentResult.original_answer}
                  phrases={currentResult.flagged_phrases || []}
                />
              ) : displayTranscript ? (
                <div className="text-sm leading-relaxed">
                  <span style={{ color: "var(--foreground)" }}>{liveTranscript}</span>
                  {interimText && (
                    <span style={{ color: "var(--muted-foreground)" }}> {interimText}</span>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center py-8">
                  <Mic className="h-8 w-8 mb-2" style={{ color: "var(--muted-foreground)" }} />
                  <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {isRecording
                      ? "Speak your answer... Your words will appear here."
                      : "Press the microphone to start recording your answer."}
                  </div>
                </div>
              )}
              {scoring && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" /> Analyzing translation...
                  </div>
                </div>
              )}
            </div>

            {/* Audio level meter + recording controls */}
            {!currentResult && (
              <div className="space-y-3">
                {isRecording && (
                  <div className="flex justify-center">
                    <AudioLevelMeter level={vad.audioLevel} isActive={vad.isSpeaking} />
                  </div>
                )}

                <div className="flex gap-2">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={scoring}
                      className="flex-1 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Mic className="h-5 w-5" /> Start Speaking
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex-1 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Square className="h-4 w-4" /> Done — Score My Answer
                    </button>
                  )}
                  <button
                    onClick={nextQuestion}
                    disabled={isRecording}
                    className="px-4 py-3 rounded-lg border font-medium flex items-center gap-1 disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                    title="Skip question"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Post-scoring next button */}
            {currentResult && (
              <div className="flex gap-2">
                <button
                  onClick={nextQuestion}
                  className="flex-1 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  {isLast ? "Finish Session" : "Next Question"} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded">{error}</div>
            )}
          </div>

          {/* RIGHT: Drift Feedback */}
          <div className="space-y-4">
            {currentResult ? (
              <>
                {/* Drift Gauge */}
                <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <div className="text-sm font-medium mb-3">Drift Score</div>
                  <DriftGauge score={currentResult.drift_score} signal={currentResult.signal} />
                </div>

                {/* Scoring Breakdown */}
                <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <div className="text-sm font-medium mb-3">Scoring Breakdown</div>
                  <div className="space-y-2">
                    {Object.entries(currentResult.scoring_breakdown).map(([key, val]) => {
                      const dim = DIMENSION_LABELS[key];
                      if (!dim) return null;
                      return (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {val ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <X className="h-4 w-4 text-red-500" />
                            )}
                            <span>{dim.label}</span>
                          </div>
                          <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                            {dim.weight}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Flagged Phrases List */}
                {currentResult.flagged_phrases && currentResult.flagged_phrases.length > 0 && (
                  <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <div className="text-sm font-medium mb-3">
                      Flagged Phrases ({currentResult.flagged_phrases.length})
                    </div>
                    <div className="space-y-2">
                      {currentResult.flagged_phrases.map((fp, i) => (
                        <div
                          key={i}
                          className="rounded-md border p-2.5 text-sm"
                          style={{
                            borderColor: "var(--border)",
                            background: "rgba(239,68,68,0.03)",
                          }}
                        >
                          <div className="text-red-500 font-medium">&ldquo;{fp.original}&rdquo;</div>
                          <div className="mt-1 text-green-600">
                            → &ldquo;{fp.suggested}&rdquo;
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Coaching Note */}
                {currentResult.coaching_note && (
                  <div
                    className="rounded-lg border-l-4 border-purple-500 p-4 text-sm"
                    style={{ background: "var(--card)" }}
                  >
                    <div className="font-medium text-purple-600 mb-1">Coaching</div>
                    <p style={{ color: "var(--foreground)" }}>{currentResult.coaching_note}</p>
                  </div>
                )}

                {/* Translated Version */}
                {currentResult.translated_version && (
                  <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium text-green-600">
                        How to Say This Instead
                      </div>
                      <button
                        onClick={() => copyTranslated(currentResult.translated_version!)}
                        className="text-xs flex items-center gap-1 px-2 py-1 rounded border hover:bg-green-500/10 transition-colors"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <ClipboardCopy className="h-3 w-3" />
                        {copiedToast ? "Copied!" : "Use This Framing"}
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                      {currentResult.translated_version}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div
                className="rounded-lg border border-dashed p-8 flex flex-col items-center justify-center text-center"
                style={{ borderColor: "var(--border)", minHeight: "300px" }}
              >
                <Mic className="h-10 w-10 mb-3" style={{ color: "var(--muted-foreground)" }} />
                <div className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                  Speak your answer, then drift feedback will appear here.
                </div>
                <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                  Focus on leading with the problem, quantifying outcomes, and removing jargon.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // SUMMARY STATE
  // -----------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Languages className="h-6 w-6 text-purple-500" /> Session Complete
        </h1>
        {session?.avg_drift_score != null && (
          <div className="flex justify-center">
            <SignalBadge
              signal={
                session.avg_drift_score >= 0.75
                  ? "green"
                  : session.avg_drift_score >= 0.45
                  ? "amber"
                  : "red"
              }
            />
          </div>
        )}
        {session?.avg_drift_score != null && (
          <div className="text-3xl font-bold mt-2">
            {Math.round(session.avg_drift_score * 100)}%
          </div>
        )}
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Average drift score across {attempts.length} answer{attempts.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Per-attempt cards */}
      <div className="space-y-3">
        {attempts.map((a, i) => {
          const q = filteredQuestions.find((fq) => fq.id === a.question_id);
          return (
            <div
              key={a.id}
              className="rounded-lg border p-4 flex items-start gap-3"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div
                className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${
                  a.signal === "green"
                    ? "bg-green-500"
                    : a.signal === "amber"
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {q?.question_text || a.custom_question || `Question ${i + 1}`}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  Score: {Math.round(a.drift_score * 100)}% •{" "}
                  {a.flagged_phrases?.length || 0} flagged phrases
                </div>
              </div>
              <div className="text-sm font-bold">
                {Math.round(a.drift_score * 100)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => {
            setPageState("setup");
            setSession(null);
            setAttempts([]);
            setCurrentResult(null);
            setLiveTranscript("");
            setInterimText("");
            transcriptRef.current = "";
            setCurrentQuestionIdx(0);
          }}
          className="flex-1 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors"
        >
          New Session
        </button>
        <Link
          href="/translation-coach/history"
          className="flex-1 py-2.5 rounded-lg border text-center font-semibold flex items-center justify-center gap-2"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          <History className="h-4 w-4" /> View History
        </Link>
      </div>
    </div>
  );
}
