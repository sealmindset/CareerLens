"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  Copy,
  Check,
  MessageSquare,
  Lightbulb,
  Loader2,
  Sun,
  Moon,
  Mic,
  MicOff,
  PenLine,
  RotateCcw,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useUnifiedStt } from "../(auth)/interview-simulator/hooks/use-unified-stt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WarmupExercise {
  id: string;
  title: string;
  setup: string;
  scaffold: [string, string, string];
  tip: string;
  category: "warmup";
}

interface InterviewQuestion {
  id: string;
  title: string;
  setup: string;
  category: "interview";
}

type PracticeQuestion = WarmupExercise | InterviewQuestion;

interface ScoringResult {
  drift_score: number;
  signal: "red" | "amber" | "green";
  scoring_breakdown: Record<string, boolean>;
  flagged_phrases: Array<{ phrase: string; suggestion: string }>;
  coaching_note: string;
  translated_version: string;
}

type PageState = "preflight" | "idle" | "answering" | "scoring" | "results";

// ---------------------------------------------------------------------------
// Question Bank
// ---------------------------------------------------------------------------

const WARMUP_EXERCISES: WarmupExercise[] = [
  {
    id: "boss-recap",
    title: "The Boss Recap",
    setup: "Think of something technical you solved recently. Explain it to your boss in 60 seconds.",
    scaffold: [
      "What was the business problem? (not the technical symptom)",
      "What did you do? (one sentence, no jargon)",
      "What's the business result? (a number, a timeline, or a risk removed)",
    ],
    tip: "Your boss doesn't debug — they prioritize. Give them a reason to care, not a system diagram.",
    category: "warmup",
  },
  {
    id: "before-after",
    title: "Before & After",
    setup: "Pick a project where you changed something significant. Tell the story of the transformation.",
    scaffold: [
      "What was painful or broken before? (the human cost, not the root cause)",
      "What was the turning point? (the decision, not the implementation)",
      "What's different now? (how people's work or lives changed)",
    ],
    tip: "The 'before' creates tension. The 'after' creates satisfaction. The turning point is YOU.",
    category: "warmup",
  },
  {
    id: "why-it-mattered",
    title: "Why It Mattered",
    setup: "Pick a technical task you completed. You know HOW you did it. Now practice saying WHY.",
    scaffold: [
      "Who was being affected by this problem? (a person, a team, a customer)",
      "What were they feeling or experiencing? (frustration, risk, lost time)",
      "What changed for THEM after you solved it? (not what you deployed — what they experienced)",
    ],
    tip: "When you catch yourself explaining the mechanism, stop. Pivot back to the person.",
    category: "warmup",
  },
  {
    id: "the-stakes",
    title: "The Stakes",
    setup: "Think of a time you convinced leadership to invest in something technical.",
    scaffold: [
      "What was at risk if nothing changed? (revenue, customers, reputation)",
      "What was the opportunity if they invested? (the business unlock, not the feature)",
      "What actually happened? (the outcome, in one sentence)",
    ],
    tip: "FUD says 'we'll get breached.' Stakes say 'we're leaving $2M on the table.'",
    category: "warmup",
  },
  {
    id: "narrate-not-analyze",
    title: "Narrate, Don't Analyze",
    setup: "Describe something you worked on recently. If you hear yourself explaining HOW, pivot to WHY.",
    scaffold: [
      "What were you trying to accomplish? (the goal, not the task)",
      "What made it interesting or challenging? (the tension, not the error message)",
      "Where does it go from here? (the impact, not the next sprint ticket)",
    ],
    tip: "Your brain WILL try to explain the mechanism. Catch it. Redirect. That's the whole practice.",
    category: "warmup",
  },
  {
    id: "define-your-anchor",
    title: "Define Your Anchor",
    setup: "Craft one sentence that captures what you want the interviewer to remember about you.",
    scaffold: [
      "What's the ONE central idea you want every answer to reinforce?",
      "Why should THIS company care about that idea specifically?",
      "Say it out loud — does it sound like a leader or a technician?",
    ],
    tip: "An anchor isn't a tagline. It's a compass that orients every answer back to your value.",
    category: "warmup",
  },
  {
    id: "headlines-first",
    title: "Headlines First",
    setup: "Answer a question by stating your conclusion FIRST, then support it with evidence.",
    scaffold: [
      "What's the one-sentence headline? (the conclusion, not the setup)",
      "What's the strongest supporting evidence? (one example, quantified)",
      "What's the implication? (what this means for the business going forward)",
    ],
    tip: "Journalists call it 'don't bury the lede.' Interviewers call it 'getting to the point.'",
    category: "warmup",
  },
  {
    id: "thirty-second-version",
    title: "30-Second Version",
    setup: "Take a 3-minute story and compress it to 30 seconds. Keep only what changes the listener's mind.",
    scaffold: [
      "What's the situation? (one sentence max)",
      "What did you do? (the decision, not the process)",
      "What was the result? (a number or a clear outcome)",
    ],
    tip: "If you can say it in 30 seconds, you understand it. If you can't, you're still processing.",
    category: "warmup",
  },
];

const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "iq-influence",
    title: "Influencing Technical Decisions",
    setup: "Tell me about a time you had to influence a technical decision at the executive level.",
    category: "interview",
  },
  {
    id: "iq-security",
    title: "Security with Business Impact",
    setup: "Describe a security initiative you led that had measurable business impact.",
    category: "interview",
  },
  {
    id: "iq-ai",
    title: "AI Solving Real Problems",
    setup: "How have you used AI or automation to solve a real business problem?",
    category: "interview",
  },
  {
    id: "iq-disagree",
    title: "Disagreeing with Leadership",
    setup: "Tell me about a time you disagreed with leadership and what you did about it.",
    category: "interview",
  },
  {
    id: "iq-incomplete",
    title: "Decisions Under Uncertainty",
    setup: "Describe a situation where you had to make a critical decision with incomplete information.",
    category: "interview",
  },
];

// ---------------------------------------------------------------------------
// API helpers (inline — no auth needed)
// ---------------------------------------------------------------------------

const API_BASE = "/api/interview-practice";

async function submitAnswer(question: string, answer: string, jobDescription?: string) {
  const res = await fetch(`${API_BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answer, job_description: jobDescription || null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ job_id: string; status: string }>;
}

async function getResult(jobId: string) {
  const res = await fetch(`${API_BASE}/result/${jobId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ status: string; result?: ScoringResult; error?: string }>;
}

// ---------------------------------------------------------------------------
// Dimension labels
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<string, string> = {
  led_with_problem: "Led with the Problem",
  business_outcome_present: "Business Outcome",
  jargon_translated: "Jargon Translated",
  used_employers_language: "Employer's Language",
  quantified_impact: "Quantified Impact",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MobilePracticePage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pageState, setPageState] = useState<PageState>("preflight");
  const [selectedQuestion, setSelectedQuestion] = useState<PracticeQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [showJobDesc, setShowJobDesc] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<string>("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [waitingForTap, setWaitingForTap] = useState(false);

  // Preflight state
  const [preflightMic, setPreflightMic] = useState<"pending" | "ok" | "fail">("pending");
  const [preflightTts, setPreflightTts] = useState<"pending" | "ok" | "fail">("pending");
  const [preflightStt, setPreflightStt] = useState<"pending" | "ok" | "fail" | "testing">("pending");
  const [preflightSttMode, setPreflightSttMode] = useState<string>("");
  const [preflightAudioLevel, setPreflightAudioLevel] = useState(0);
  const [preflightTranscript, setPreflightTranscript] = useState("");
  const [preflightError, setPreflightError] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const transcriptRef = useRef("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechRef = useRef<number>(Date.now());
  const autoSubmitRef = useRef(false);

  // -----------------------------------------------------------------------
  // TTS — browser speech synthesis
  // -----------------------------------------------------------------------

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      utter.onstart = () => setIsSpeaking(true);
      utter.onend = () => { setIsSpeaking(false); resolve(); };
      utter.onerror = () => { setIsSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utter);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // -----------------------------------------------------------------------
  // STT with silence detection for auto-stop
  // -----------------------------------------------------------------------

  const stt = useUnifiedStt({
    onInterim: useCallback((text: string) => {
      setInterimText(text);
      lastSpeechRef.current = Date.now();
    }, []),
    onFinal: useCallback((text: string) => {
      transcriptRef.current = transcriptRef.current
        ? transcriptRef.current + " " + text
        : text;
      setAnswer(transcriptRef.current);
      setInterimText("");
      lastSpeechRef.current = Date.now();
    }, []),
  });

  // Auto-stop after 4 seconds of silence when recording
  useEffect(() => {
    if (!stt.isListening) {
      if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; }
      return;
    }

    lastSpeechRef.current = Date.now();
    silenceTimerRef.current = setInterval(() => {
      const silenceMs = Date.now() - lastSpeechRef.current;
      if (silenceMs > 4000 && transcriptRef.current.trim()) {
        stt.stop();
        setInterimText("");
        autoSubmitRef.current = true;
      }
    }, 500);

    return () => {
      if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null; }
    };
  }, [stt.isListening, stt]);

  // When STT stops and auto-submit is flagged, submit automatically
  useEffect(() => {
    if (!stt.isListening && autoSubmitRef.current && transcriptRef.current.trim()) {
      autoSubmitRef.current = false;
      // Small delay so user sees their final transcript
      const t = setTimeout(() => {
        doSubmit();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [stt.isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVoice = useCallback(async () => {
    if (stt.isListening) {
      stt.stop();
      setInterimText("");
      setVoiceStatus("");
      setWaitingForTap(false);
    } else {
      stopSpeaking();
      setWaitingForTap(false);
      transcriptRef.current = answer;
      setVoiceStatus("Listening...");
      await stt.start();
    }
  }, [stt, answer, stopSpeaking]);

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("clearlens-job-description");
    if (saved) setJobDescription(saved);
  }, []);

  useEffect(() => {
    if (jobDescription) localStorage.setItem("clearlens-job-description", jobDescription);
  }, [jobDescription]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      stopSpeaking();
    };
  }, [stopSpeaking]);

  // -----------------------------------------------------------------------
  // Preflight checks
  // -----------------------------------------------------------------------

  const cleanupPreflight = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const runPreflightMic = useCallback(async () => {
    setPreflightMic("pending");
    setPreflightError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setPreflightAudioLevel(avg);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      setPreflightMic("ok");
    } catch (e) {
      setPreflightMic("fail");
      setPreflightError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied. Check your browser settings."
          : `Mic error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, []);

  const runPreflightTts = useCallback(async () => {
    setPreflightTts("pending");
    if (!window.speechSynthesis) {
      setPreflightTts("fail");
      return;
    }
    try {
      await speak("Voice check. Can you hear me?");
      setPreflightTts("ok");
    } catch {
      setPreflightTts("fail");
    }
  }, [speak]);

  const runPreflightStt = useCallback(async () => {
    setPreflightStt("testing");
    setPreflightSttMode(stt.mode);
    setPreflightTranscript("");

    if (stt.mode === "none") {
      setPreflightStt("fail");
      setPreflightError("No speech recognition available. Try Chrome on Android or a Chromium browser.");
      return;
    }

    await speak("Say something now to test your microphone.");

    // Start STT — this is inside a user-gesture chain from the button tap
    const started = await stt.start();
    if (!started) {
      setPreflightStt("fail");
      setPreflightError(`Failed to start ${stt.mode} speech recognition.`);
      return;
    }

    // Wait up to 8 seconds for a transcript
    let gotTranscript = false;
    const checkInterval = setInterval(() => {
      if (transcriptRef.current.trim()) {
        gotTranscript = true;
      }
    }, 200);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        stt.stop();
        resolve();
      }, 8000);

      // Also resolve early if we get a transcript
      const earlyCheck = setInterval(() => {
        if (transcriptRef.current.trim()) {
          clearTimeout(timeout);
          clearInterval(earlyCheck);
          clearInterval(checkInterval);
          gotTranscript = true;
          stt.stop();
          resolve();
        }
      }, 300);
    });

    if (gotTranscript) {
      setPreflightTranscript(transcriptRef.current.trim());
      setPreflightStt("ok");
      await speak("I heard you. Voice is working.");
      // Reset for actual practice
      transcriptRef.current = "";
      setAnswer("");
    } else {
      setPreflightStt("fail");
      setPreflightError(
        `Speech recognition (${stt.mode}) started but captured nothing. ` +
        (stt.mode === "webspeech"
          ? "Web Speech API may not work on this browser. Try Chrome on Android."
          : "Whisper STT may not be reachable.")
      );
    }
  }, [stt, speak]);

  const runAllPreflight = useCallback(async () => {
    setPreflightMic("pending");
    setPreflightTts("pending");
    setPreflightStt("pending");
    setPreflightTranscript("");
    setPreflightError("");
    transcriptRef.current = "";
    setAnswer("");

    await runPreflightMic();
    await runPreflightTts();
    // STT test must be triggered by user tap (separate button)
  }, [runPreflightMic, runPreflightTts]);

  const skipPreflight = useCallback(() => {
    cleanupPreflight();
    setPageState("idle");
  }, [cleanupPreflight]);

  const preflightDone = useCallback(() => {
    cleanupPreflight();
    setPageState("idle");
  }, [cleanupPreflight]);

  // -----------------------------------------------------------------------
  // Hands-free flow: select question → TTS reads it → prompt for tap
  // -----------------------------------------------------------------------

  const selectQuestion = useCallback(async (q: PracticeQuestion) => {
    setSelectedQuestion(q);
    setAnswer("");
    setResult(null);
    setError(null);
    setInterimText("");
    transcriptRef.current = "";
    autoSubmitRef.current = false;
    setWaitingForTap(false);
    stt.stop();
    setPageState("answering");

    const isWarmup = q.category === "warmup";
    const warmup = isWarmup ? (q as WarmupExercise) : null;

    let prompt = q.setup;
    if (warmup) {
      prompt += ". Here's your structure. One: " + warmup.scaffold[0].split("(")[0] +
        ". Two: " + warmup.scaffold[1].split("(")[0] +
        ". Three: " + warmup.scaffold[2].split("(")[0];
    }
    prompt += ". Take a moment to plan your answer. Tap the mic when you're ready.";

    setVoiceStatus("Reading question...");
    await speak(prompt);
    setVoiceStatus("");
    setWaitingForTap(true);
  }, [stt, speak]);

  const submitCustomQuestion = useCallback(() => {
    if (!customQuestion.trim()) return;
    const q: InterviewQuestion = {
      id: "custom",
      title: "Custom Question",
      setup: customQuestion.trim(),
      category: "interview",
    };
    selectQuestion(q);
    setShowCustom(false);
  }, [customQuestion, selectQuestion]);

  // -----------------------------------------------------------------------
  // Submit + TTS results
  // -----------------------------------------------------------------------

  const doSubmit = useCallback(async () => {
    const currentAnswer = transcriptRef.current.trim() || answer.trim();
    if (!selectedQuestion || !currentAnswer) return;

    stt.stop();
    setInterimText("");
    setAnswer(currentAnswer);
    setPageState("scoring");
    setError(null);

    await speak("Got it. Scoring your answer now.");

    try {
      const { job_id } = await submitAnswer(
        selectedQuestion.setup,
        currentAnswer,
        jobDescription || undefined,
      );
      setJobId(job_id);

      pollRef.current = setInterval(async () => {
        try {
          const data = await getResult(job_id);
          if (data.status === "complete" && data.result) {
            if (pollRef.current) clearInterval(pollRef.current);
            setResult(data.result);
            setPageState("results");

            // Read the score and coaching aloud
            const scorePercent = Math.round(data.result.drift_score * 100);
            const label = data.result.signal === "green" ? "on track" :
              data.result.signal === "amber" ? "drifting" : "in the weeds";
            let readout = `Score: ${scorePercent} percent. ${label}.`;

            // Count dimensions hit
            const dims = Object.values(data.result.scoring_breakdown);
            const hit = dims.filter(Boolean).length;
            readout += ` You hit ${hit} out of ${dims.length} dimensions.`;

            if (data.result.coaching_note) {
              // Read first 2 sentences of coaching
              const sentences = data.result.coaching_note.split(/[.!?]+/).filter(Boolean);
              readout += " " + sentences.slice(0, 2).join(". ") + ".";
            }

            readout += " Say try again, or tap next question.";
            await speak(readout);
          } else if (data.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(data.error || "Scoring failed");
            setPageState("answering");
            await speak("Scoring failed. You can try again.");
          }
        } catch {
          // Keep polling on transient errors
        }
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
      setPageState("answering");
      await speak("Something went wrong. Please try again.");
    }
  }, [selectedQuestion, answer, jobDescription, stt, speak]);

  const handleSubmit = useCallback(async () => {
    await doSubmit();
  }, [doSubmit]);

  const tryAgain = useCallback(async () => {
    setAnswer("");
    setResult(null);
    setError(null);
    setInterimText("");
    transcriptRef.current = "";
    autoSubmitRef.current = false;
    setWaitingForTap(false);
    stt.stop();
    setPageState("answering");

    await speak("Let's try that again. Tap the mic when you're ready.");
    setVoiceStatus("");
    setWaitingForTap(true);
  }, [stt, speak]);

  const nextQuestion = useCallback(() => {
    setSelectedQuestion(null);
    setAnswer("");
    setResult(null);
    setError(null);
    setJobId(null);
    setInterimText("");
    transcriptRef.current = "";
    autoSubmitRef.current = false;
    stt.stop();
    stopSpeaking();
    setPageState("idle");
  }, [stt, stopSpeaking]);

  const copyTranslated = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const signalColor = (signal: string) => {
    if (signal === "green") return "text-green-500";
    if (signal === "amber") return "text-amber-500";
    return "text-red-500";
  };

  const signalBg = (signal: string) => {
    if (signal === "green") return "bg-green-500";
    if (signal === "amber") return "bg-amber-500";
    return "bg-red-500";
  };

  const signalLabel = (signal: string) => {
    if (signal === "green") return "On Track";
    if (signal === "amber") return "Drifting";
    return "In the Weeds";
  };

  if (!mounted) return null;

  // =========================================================================
  // PREFLIGHT — Voice System Check
  // =========================================================================
  if (pageState === "preflight") {
    const statusIcon = (s: "pending" | "ok" | "fail" | "testing") => {
      if (s === "ok") return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      if (s === "fail") return <XCircle className="w-5 h-5 text-red-500" />;
      if (s === "testing") return <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />;
      return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
    };

    const allPassed = preflightMic === "ok" && preflightTts === "ok" && preflightStt === "ok";

    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ClearLens</h1>
            <p className="text-sm text-muted-foreground">Voice System Check</p>
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Let&apos;s make sure your microphone, speaker, and speech recognition are working before we start.
        </p>

        {/* Check list */}
        <div className="space-y-4 mb-6">
          {/* Mic check */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3 mb-2">
              {statusIcon(preflightMic)}
              <span className="font-medium text-sm">Microphone</span>
            </div>
            {preflightMic === "ok" && (
              <div className="ml-8">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Level:</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-100"
                      style={{ width: `${Math.min(100, preflightAudioLevel * 1.5)}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-1">Microphone is capturing audio</p>
              </div>
            )}
            {preflightMic === "fail" && (
              <p className="text-xs text-red-500 ml-8">
                {preflightError || "Microphone not accessible"}
              </p>
            )}
          </div>

          {/* TTS check */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              {statusIcon(preflightTts)}
              <span className="font-medium text-sm">Speaker / TTS</span>
            </div>
            {preflightTts === "ok" && (
              <p className="text-xs text-green-600 ml-8 mt-1">You should have heard &ldquo;Voice check&rdquo;</p>
            )}
            {preflightTts === "fail" && (
              <p className="text-xs text-red-500 ml-8 mt-1">Text-to-speech not available</p>
            )}
          </div>

          {/* STT check */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3 mb-2">
              {statusIcon(preflightStt)}
              <span className="font-medium text-sm">Speech Recognition</span>
              {preflightSttMode && (
                <span className="text-[10px] text-muted-foreground/60 uppercase ml-auto">
                  {preflightSttMode}
                </span>
              )}
            </div>
            {preflightStt === "testing" && (
              <p className="text-xs text-purple-400 ml-8">Say something — testing...</p>
            )}
            {preflightStt === "ok" && (
              <div className="ml-8">
                <p className="text-xs text-green-600">Heard: &ldquo;{preflightTranscript}&rdquo;</p>
              </div>
            )}
            {preflightStt === "fail" && (
              <p className="text-xs text-red-500 ml-8">
                {preflightError || "Speech recognition not working"}
              </p>
            )}
            {preflightMic === "ok" && preflightTts === "ok" && preflightStt === "pending" && (
              <button
                onClick={runPreflightStt}
                className="ml-8 mt-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium active:scale-95 transition-all"
              >
                Test Speech Recognition
              </button>
            )}
          </div>
        </div>

        {/* Error details */}
        {preflightError && preflightStt !== "fail" && preflightMic !== "fail" && (
          <p className="text-xs text-red-500 mb-4">{preflightError}</p>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {preflightMic === "pending" && (
            <button
              onClick={runAllPreflight}
              className="w-full py-3 rounded-xl bg-purple-600 text-white font-medium active:scale-[0.98] transition-all text-sm"
            >
              Start Voice Check
            </button>
          )}

          {allPassed && (
            <button
              onClick={preflightDone}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-medium active:scale-[0.98] transition-all text-sm"
            >
              All Systems Go — Start Practicing
            </button>
          )}

          {(preflightMic === "fail" || preflightStt === "fail") && (
            <button
              onClick={() => {
                cleanupPreflight();
                setPreflightMic("pending");
                setPreflightTts("pending");
                setPreflightStt("pending");
                setPreflightError("");
              }}
              className="w-full py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Retry Check
            </button>
          )}

          <button
            onClick={skipPreflight}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip — I know my setup works
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // IDLE — Question Bank
  // =========================================================================
  if (pageState === "idle") {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ClearLens</h1>
            <p className="text-sm text-muted-foreground">Interview Practice</p>
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Warm-Up Exercises */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Warm-Up Exercises
          </h2>
          <div className="space-y-2">
            {WARMUP_EXERCISES.map((ex) => (
              <button
                key={ex.id}
                onClick={() => selectQuestion(ex)}
                className="w-full text-left p-4 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 hover:from-purple-500/10 hover:to-indigo-500/10 transition-all active:scale-[0.98]"
              >
                <div className="font-medium text-sm">{ex.title}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{ex.setup}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Interview Questions */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Interview Questions
          </h2>
          <div className="space-y-2">
            {INTERVIEW_QUESTIONS.map((q) => (
              <button
                key={q.id}
                onClick={() => selectQuestion(q)}
                className="w-full text-left p-4 rounded-xl border border-border hover:bg-muted/50 transition-all active:scale-[0.98]"
              >
                <div className="font-medium text-sm">{q.title}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{q.setup}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Custom Question */}
        <section>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <PenLine className="w-4 h-4" />
            Custom Question
            {showCustom ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showCustom && (
            <div className="mt-3 space-y-2">
              <textarea
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="Type your own interview question..."
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
              <button
                onClick={submitCustomQuestion}
                disabled={!customQuestion.trim()}
                className="w-full py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                Use This Question
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // ANSWERING — Question + Scaffold + Textarea
  // =========================================================================
  if (pageState === "answering") {
    const isWarmup = selectedQuestion?.category === "warmup";
    const warmup = isWarmup ? (selectedQuestion as WarmupExercise) : null;

    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Back button */}
        <button
          onClick={nextQuestion}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {/* Question */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{selectedQuestion?.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{selectedQuestion?.setup}</p>
        </div>

        {/* Scaffold (warm-up only) */}
        {warmup && (
          <div className="mb-4 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 p-4">
            <div className="space-y-3">
              {warmup.scaffold.map((step, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <p className="text-sm font-medium pt-0.5">{step}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2 items-start text-xs text-muted-foreground">
              <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{warmup.tip}</span>
            </div>
          </div>
        )}

        {/* Job Description (collapsible) */}
        <button
          onClick={() => setShowJobDesc(!showJobDesc)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
        >
          Job description {showJobDesc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showJobDesc && (
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description for more targeted scoring..."
            rows={3}
            className="w-full mb-4 rounded-lg border border-border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
        )}

        {/* Voice status */}
        <div className="mb-4">
          <div className="flex items-center justify-center mb-3">
            <span className={`text-sm font-medium ${
              isSpeaking ? "text-indigo-400" :
              stt.isListening ? "text-purple-400" :
              waitingForTap ? "text-purple-400 animate-pulse" :
              "text-muted-foreground"
            }`}>
              {isSpeaking ? "Reading question..." :
               stt.isListening ? "Listening — speak your answer..." :
               waitingForTap ? "Tap the mic when you're ready" :
               voiceStatus || "Tap the mic to start"}
            </span>
          </div>

          {/* Mic button */}
          <div className="flex justify-center mb-4">
            <button
              onClick={toggleVoice}
              disabled={stt.mode === "none" || isSpeaking}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                stt.isListening
                  ? "bg-red-500 text-white shadow-lg shadow-red-500/40 animate-pulse"
                  : isSpeaking
                    ? "bg-indigo-500/60 text-white shadow-lg shadow-indigo-500/20"
                    : waitingForTap
                      ? "bg-purple-600 text-white shadow-xl shadow-purple-600/50 animate-bounce"
                      : "bg-purple-600 text-white shadow-lg shadow-purple-600/30 hover:bg-purple-700"
              } ${stt.mode === "none" ? "opacity-40" : ""}`}
            >
              {stt.isListening ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
            </button>
          </div>

          {stt.mode === "none" && (
            <p className="text-xs text-amber-500 text-center mb-3">
              Voice not available on this browser. Use the text box below.
            </p>
          )}

          {/* Live transcript + interim */}
          <div className={`rounded-lg border p-3 mb-3 text-sm min-h-[80px] ${
            stt.isListening ? "border-purple-500/40 bg-purple-500/5" : "border-border"
          }`}>
            {answer || interimText ? (
              <>
                <span>{answer}</span>
                {interimText && (
                  <span className="text-muted-foreground/60"> {interimText}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/40 italic">Your answer will appear here as you speak...</span>
            )}
          </div>

          {/* Text fallback (collapsed by default) */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">
              Or type instead
            </summary>
            <textarea
              ref={textareaRef}
              value={answer}
              onChange={(e) => { setAnswer(e.target.value); transcriptRef.current = e.target.value; }}
              placeholder="Type your answer here..."
              rows={3}
              className="w-full mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            />
          </details>
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}

        {/* Manual submit (auto-submit happens on silence, but keep as fallback) */}
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || stt.isListening || isSpeaking}
          className="w-full mt-2 py-3 rounded-xl bg-purple-600 text-white font-medium disabled:opacity-40 active:scale-[0.98] transition-all text-sm"
        >
          Score My Answer
        </button>
        <p className="text-[10px] text-center text-muted-foreground/50 mt-1">
          Auto-submits after 4 seconds of silence
        </p>
      </div>
    );
  }

  // =========================================================================
  // SCORING — Loading state
  // =========================================================================
  if (pageState === "scoring") {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Analyzing your answer...</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This takes about 10 seconds</p>
      </div>
    );
  }

  // =========================================================================
  // RESULTS — Score + Coaching + Translated Version
  // =========================================================================
  if (pageState === "results" && result) {
    const score = result.drift_score;
    const circumference = 2 * Math.PI * 45;
    const strokeDash = score * circumference;

    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Score Gauge */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
              <circle
                cx="50" cy="50" r="45" fill="none" strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${strokeDash} ${circumference}`}
                className={signalColor(result.signal)}
                style={{ stroke: "currentColor" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold ${signalColor(result.signal)}`}>
                {Math.round(score * 100)}
              </span>
            </div>
          </div>
          <span className={`mt-2 px-3 py-1 rounded-full text-xs font-semibold text-white ${signalBg(result.signal)}`}>
            {signalLabel(result.signal)}
          </span>
        </div>

        {/* Scoring Breakdown */}
        <div className="mb-6 rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold mb-3">Scoring Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(result.scoring_breakdown).map(([key, passed]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{DIMENSION_LABELS[key] || key}</span>
                {passed ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Coaching Note */}
        {result.coaching_note && (
          <div className="mb-6 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold">Coaching</h3>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{result.coaching_note}</p>
          </div>
        )}

        {/* Flagged Phrases */}
        {result.flagged_phrases && result.flagged_phrases.length > 0 && (
          <div className="mb-6 rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Flagged Phrases</h3>
            <div className="space-y-2">
              {result.flagged_phrases.map((fp, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-red-400">&ldquo;{fp.phrase}&rdquo;</span>
                  {fp.suggestion && (
                    <span className="text-muted-foreground ml-1">&rarr; {fp.suggestion}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Translated Version */}
        {result.translated_version && (
          <div className="mb-6 rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-emerald-500/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Reframed Answer</h3>
              <button
                onClick={() => copyTranslated(result.translated_version)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{result.translated_version}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={tryAgain}
            className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
          <button
            onClick={nextQuestion}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            Next Question
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
