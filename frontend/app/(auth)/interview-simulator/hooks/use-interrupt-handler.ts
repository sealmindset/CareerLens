"use client";

import { useCallback, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type InterruptTrigger = "volume" | "word";

export interface InterruptConfig {
  /** dB level the user must exceed to trigger a volume-based interrupt (default -30) */
  volumeThreshold?: number;
  /** ms the user must sustain speech above threshold before firing (default 300) */
  persistDuration?: number;
  /** Enable volume-based interrupt detection (default true) */
  enableVolumeInterrupt?: boolean;
  /** Enable keyword-based interrupt detection (default true) */
  enableWordInterrupt?: boolean;
  /** Words that trigger an immediate interrupt when spoken during TTS (default list below) */
  interruptWords?: string[];

  /* Callback */
  onInterrupt?: (trigger: InterruptTrigger, detail: string) => void;
}

export interface UseInterruptHandlerReturn {
  /**
   * Call from an animation loop or VAD polling interval.
   * Checks whether sustained audio above threshold warrants an interrupt.
   *
   * @param level     Current audio level in dB (from VAD)
   * @param isInterviewerSpeaking  Whether TTS is currently playing
   */
  checkAudioLevel: (level: number, isInterviewerSpeaking: boolean) => void;

  /**
   * Call when a transcript chunk arrives.
   * Scans for interrupt keywords while interviewer is speaking.
   *
   * @param text                   Transcript text to scan
   * @param isInterviewerSpeaking  Whether TTS is currently playing
   */
  checkTranscript: (text: string, isInterviewerSpeaking: boolean) => void;

  /** True when an interrupt has been detected and not yet reset */
  interruptDetected: boolean;

  /** Clear the interrupt flag and internal timers */
  reset: () => void;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_VOLUME_THRESHOLD = -30;
const DEFAULT_PERSIST_DURATION = 300;
const DEFAULT_INTERRUPT_WORDS = [
  "actually",
  "wait",
  "sorry",
  "um",
  "excuse me",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse
 * whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check whether `text` contains any of the `words`.
 * Returns the first matching word, or null if none match.
 */
function findInterruptWord(
  text: string,
  words: string[]
): string | null {
  const normalized = normalize(text);
  for (const word of words) {
    // For multi-word phrases (e.g. "excuse me") do a simple includes check.
    // For single words, use a word-boundary approach to avoid false positives.
    const normalizedWord = normalize(word);
    if (!normalizedWord) continue;

    if (normalizedWord.includes(" ")) {
      // Multi-word phrase — substring match is sufficient
      if (normalized.includes(normalizedWord)) return word;
    } else {
      // Single word — match at word boundaries
      const regex = new RegExp(`\\b${normalizedWord}\\b`);
      if (regex.test(normalized)) return word;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useInterruptHandler(
  config: InterruptConfig = {}
): UseInterruptHandlerReturn {
  const {
    volumeThreshold = DEFAULT_VOLUME_THRESHOLD,
    persistDuration = DEFAULT_PERSIST_DURATION,
    enableVolumeInterrupt = true,
    enableWordInterrupt = true,
    interruptWords = DEFAULT_INTERRUPT_WORDS,
    onInterrupt,
  } = config;

  /* --- Reactive state ---------------------------------------------- */
  const [interruptDetected, setInterruptDetected] = useState(false);

  /* --- Refs for mutable internals ---------------------------------- */

  /** Timestamp when audio first exceeded threshold during interviewer speech */
  const volumeExceedStartRef = useRef<number | null>(null);

  /**
   * Guard flag — once an interrupt fires, suppress further triggers until
   * `reset()` is called. Prevents rapid-fire callbacks for a single
   * interrupt event.
   */
  const firedRef = useRef(false);

  /* Keep latest callback ref stable. */
  const onInterruptRef = useRef(onInterrupt);
  onInterruptRef.current = onInterrupt;

  /* Config refs for stable closure access. */
  const volumeThresholdRef = useRef(volumeThreshold);
  const persistDurationRef = useRef(persistDuration);
  const enableVolumeRef = useRef(enableVolumeInterrupt);
  const enableWordRef = useRef(enableWordInterrupt);
  const interruptWordsRef = useRef(interruptWords);
  volumeThresholdRef.current = volumeThreshold;
  persistDurationRef.current = persistDuration;
  enableVolumeRef.current = enableVolumeInterrupt;
  enableWordRef.current = enableWordInterrupt;
  interruptWordsRef.current = interruptWords;

  /* --- Internal fire helper ---------------------------------------- */

  const fireInterrupt = useCallback(
    (trigger: InterruptTrigger, detail: string) => {
      if (firedRef.current) return;
      firedRef.current = true;
      setInterruptDetected(true);
      onInterruptRef.current?.(trigger, detail);
    },
    []
  );

  /* --- Public API -------------------------------------------------- */

  const checkAudioLevel = useCallback(
    (level: number, isInterviewerSpeaking: boolean) => {
      if (!enableVolumeRef.current) return;
      if (firedRef.current) return;

      if (!isInterviewerSpeaking) {
        // Not relevant — reset any pending volume tracking
        volumeExceedStartRef.current = null;
        return;
      }

      const now = Date.now();

      if (level > volumeThresholdRef.current) {
        // Audio is above threshold while interviewer is speaking
        if (volumeExceedStartRef.current === null) {
          volumeExceedStartRef.current = now;
        }

        const sustained = now - volumeExceedStartRef.current;
        if (sustained >= persistDurationRef.current) {
          fireInterrupt(
            "volume",
            `sustained ${sustained}ms above ${volumeThresholdRef.current} dB`
          );
        }
      } else {
        // Dropped below threshold — reset persistence tracking
        volumeExceedStartRef.current = null;
      }
    },
    [fireInterrupt]
  );

  const checkTranscript = useCallback(
    (text: string, isInterviewerSpeaking: boolean) => {
      if (!enableWordRef.current) return;
      if (firedRef.current) return;
      if (!isInterviewerSpeaking) return;
      if (!text) return;

      const match = findInterruptWord(text, interruptWordsRef.current);
      if (match) {
        fireInterrupt("word", `detected interrupt word: "${match}"`);
      }
    },
    [fireInterrupt]
  );

  const reset = useCallback(() => {
    firedRef.current = false;
    volumeExceedStartRef.current = null;
    setInterruptDetected(false);
  }, []);

  return {
    checkAudioLevel,
    checkTranscript,
    interruptDetected,
    reset,
  };
}
