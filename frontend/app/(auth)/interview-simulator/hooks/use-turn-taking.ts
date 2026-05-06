"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type Speaker = "none" | "interviewer" | "candidate";
export type TurnMode = "manual" | "hands-free";

export interface TurnTakingConfig {
  /** UI mode: manual keeps buttons, hands-free is fully automatic */
  mode?: TurnMode;
  /** ms of silence before ending candidate turn (default 1200) */
  turnTakingDelay?: number;
  /** Minimum accumulated words before considering turn complete (default 3) */
  minWordsToSend?: number;
  /**
   * Extra wait for short utterances (< minWordsToSend).
   * Gives the speaker time to continue a brief remark. (default 2000)
   */
  maxPauseForContinuation?: number;

  /* Callbacks */
  onTurnComplete?: (transcript: string) => void;
  onInterrupt?: () => void;
  onTurnChange?: (speaker: Speaker) => void;
}

export interface UseTurnTakingReturn {
  /** Who is currently holding the floor */
  currentSpeaker: Speaker;
  /** Current UI mode */
  mode: TurnMode;
  /** Toggle between manual / hands-free (persisted to localStorage) */
  setMode: (mode: TurnMode) => void;
  /** Notify that interviewer TTS started / stopped */
  setInterviewerSpeaking: (value: boolean) => void;
  /** Called by VAD when speech is detected */
  onSpeechStart: () => void;
  /** Called by VAD when silence is detected after speech */
  onSpeechEnd: () => void;
  /** Feed interim / final transcript text into the accumulator */
  onTranscriptChunk: (text: string) => void;
  /** Hard reset — clears accumulated text and returns to 'none' */
  resetTurn: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "interview-turn-mode";
const DEFAULT_TURN_TAKING_DELAY = 1200;
const DEFAULT_MIN_WORDS = 3;
const DEFAULT_MAX_PAUSE_FOR_CONTINUATION = 2000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Count words in a string (simple whitespace split). */
function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Read persisted mode from localStorage with fallback. */
function readPersistedMode(): TurnMode {
  if (typeof window === "undefined") return "manual";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "manual" || stored === "hands-free") return stored;
  } catch {
    // localStorage unavailable (SSR / privacy mode)
  }
  return "manual";
}

/** Write mode to localStorage. */
function persistMode(mode: TurnMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // silently ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useTurnTaking(config: TurnTakingConfig = {}): UseTurnTakingReturn {
  const {
    mode: initialMode,
    turnTakingDelay = DEFAULT_TURN_TAKING_DELAY,
    minWordsToSend = DEFAULT_MIN_WORDS,
    maxPauseForContinuation = DEFAULT_MAX_PAUSE_FOR_CONTINUATION,
    onTurnComplete,
    onInterrupt,
    onTurnChange,
  } = config;

  /* --- Reactive state ---------------------------------------------- */
  const [currentSpeaker, setCurrentSpeaker] = useState<Speaker>("none");
  const [mode, setModeState] = useState<TurnMode>(initialMode ?? readPersistedMode);

  /* --- Refs for mutable internals ---------------------------------- */
  const speakerRef = useRef<Speaker>("none");
  const accumulatedTextRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interviewerSpeakingRef = useRef(false);

  /* Keep latest callback refs stable. */
  const onTurnCompleteRef = useRef(onTurnComplete);
  const onInterruptRef = useRef(onInterrupt);
  const onTurnChangeRef = useRef(onTurnChange);
  onTurnCompleteRef.current = onTurnComplete;
  onInterruptRef.current = onInterrupt;
  onTurnChangeRef.current = onTurnChange;

  /* Config refs so polling / timers always see latest values. */
  const turnTakingDelayRef = useRef(turnTakingDelay);
  const minWordsRef = useRef(minWordsToSend);
  const maxPauseRef = useRef(maxPauseForContinuation);
  turnTakingDelayRef.current = turnTakingDelay;
  minWordsRef.current = minWordsToSend;
  maxPauseRef.current = maxPauseForContinuation;

  /* --- Internal helpers -------------------------------------------- */

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const changeSpeaker = useCallback((next: Speaker) => {
    speakerRef.current = next;
    setCurrentSpeaker(next);
    onTurnChangeRef.current?.(next);
  }, []);

  /**
   * Finalize the candidate's turn: fire onTurnComplete with accumulated
   * text and reset internal state.
   */
  const finalizeTurn = useCallback(() => {
    const text = accumulatedTextRef.current.trim();
    accumulatedTextRef.current = "";
    clearSilenceTimer();
    changeSpeaker("none");

    if (text) {
      onTurnCompleteRef.current?.(text);
    }
  }, [clearSilenceTimer, changeSpeaker]);

  /**
   * Schedule a silence-based turn end. Uses a longer delay when the
   * accumulated word count is below `minWordsToSend` to give the speaker
   * time to continue a short remark.
   */
  const scheduleTurnEnd = useCallback(() => {
    clearSilenceTimer();

    const words = wordCount(accumulatedTextRef.current);
    const delay =
      words < minWordsRef.current
        ? maxPauseRef.current
        : turnTakingDelayRef.current;

    silenceTimerRef.current = setTimeout(() => {
      // Double-check we still have enough words (candidate might not
      // have said anything meaningful)
      const finalWords = wordCount(accumulatedTextRef.current);
      if (finalWords >= minWordsRef.current) {
        finalizeTurn();
      } else {
        // Still below threshold — wait one more continuation window.
        // If silence persists after this extra window, finalize anyway
        // to avoid an infinite hang.
        silenceTimerRef.current = setTimeout(() => {
          finalizeTurn();
        }, maxPauseRef.current);
      }
    }, delay);
  }, [clearSilenceTimer, finalizeTurn]);

  /* --- Public API -------------------------------------------------- */

  const setMode = useCallback((next: TurnMode) => {
    setModeState(next);
    persistMode(next);
  }, []);

  const setInterviewerSpeaking = useCallback(
    (value: boolean) => {
      interviewerSpeakingRef.current = value;

      if (value) {
        // TTS started → interviewer takes the floor
        clearSilenceTimer();
        changeSpeaker("interviewer");
      } else {
        // TTS finished → floor goes to 'none' (mic can open)
        if (speakerRef.current === "interviewer") {
          changeSpeaker("none");
        }
      }
    },
    [clearSilenceTimer, changeSpeaker]
  );

  const onSpeechStart = useCallback(() => {
    if (speakerRef.current === "interviewer") {
      // Candidate is speaking while interviewer is talking → INTERRUPT
      onInterruptRef.current?.();
      changeSpeaker("candidate");
      return;
    }

    if (speakerRef.current === "none") {
      changeSpeaker("candidate");
    }

    // If already candidate, just keep going (user resumed after short pause)
    clearSilenceTimer();
  }, [changeSpeaker, clearSilenceTimer]);

  const onSpeechEnd = useCallback(() => {
    if (speakerRef.current === "candidate") {
      scheduleTurnEnd();
    }
  }, [scheduleTurnEnd]);

  const onTranscriptChunk = useCallback((text: string) => {
    if (!text) return;

    // Append to accumulator (space-separated)
    const current = accumulatedTextRef.current;
    accumulatedTextRef.current = current ? current + " " + text : text;
  }, []);

  const resetTurn = useCallback(() => {
    accumulatedTextRef.current = "";
    interviewerSpeakingRef.current = false;
    clearSilenceTimer();
    changeSpeaker("none");
  }, [clearSilenceTimer, changeSpeaker]);

  /* --- Cleanup on unmount ------------------------------------------ */
  useEffect(() => {
    return () => {
      clearSilenceTimer();
    };
  }, [clearSilenceTimer]);

  return {
    currentSpeaker,
    mode,
    setMode,
    setInterviewerSpeaking,
    onSpeechStart,
    onSpeechEnd,
    onTranscriptChunk,
    resetTurn,
  };
}
