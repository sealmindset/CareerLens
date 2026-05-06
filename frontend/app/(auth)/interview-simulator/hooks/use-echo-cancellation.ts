"use client";

import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Echo guard durations (ms after TTS ends before accepting transcripts)
// ---------------------------------------------------------------------------
const ECHO_GUARD_WEB_SPEECH_MS = 3500;
const ECHO_GUARD_WHISPER_MS = 5000;

// Minimum word-overlap ratio to classify a transcript as echo
const WORD_OVERLAP_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type STTMode = "webspeech" | "whisper";

export interface EchoState {
  isSpeaking: boolean;
  ignoreAllSpeechInput: boolean;
  ariaSpeakingEndTime: number;
  lastSpokenText: string;
  recordingStartTime: number;
  wasSpeakingAtStart: boolean;
}

export interface DiscardResult {
  discard: boolean;
  reason: string | null;
}

export interface UseEchoCancellationReturn {
  echoState: EchoState;
  setIsSpeaking: (value: boolean) => void;
  setIgnoreAllSpeechInput: (value: boolean) => void;
  setLastSpokenText: (text: string) => void;
  setRecordingStartTime: (time: number) => void;
  shouldDiscardTranscript: (text: string) => DiscardResult;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse
 * whitespace, then split into unique words.
 */
function extractWords(text: string): Set<string> {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
  if (!cleaned) return new Set();
  return new Set(cleaned.split(/\s+/));
}

/**
 * Compute the fraction of words in `candidate` that also appear in
 * `reference`. Returns 0 when either set is empty.
 */
function wordOverlapRatio(candidate: string, reference: string): number {
  const candidateWords = extractWords(candidate);
  const referenceWords = extractWords(reference);
  if (candidateWords.size === 0 || referenceWords.size === 0) return 0;

  let matchCount = 0;
  Array.from(candidateWords).forEach((word) => {
    if (referenceWords.has(word)) matchCount++;
  });
  return matchCount / candidateWords.size;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEchoCancellation(
  sttMode: STTMode = "webspeech"
): UseEchoCancellationReturn {
  // -- Reactive state (drives re-renders for UI indicators) -----------------
  const [isSpeaking, setIsSpeakingState] = useState(false);
  const [ignoreAllSpeechInput, setIgnoreAllSpeechInput] = useState(false);

  // -- Mutable refs (no re-render; read synchronously in guards) ------------
  const isSpeakingRef = useRef(false);
  const ignoreAllRef = useRef(false);
  const ariaSpeakingEndTimeRef = useRef(0);
  const lastSpokenTextRef = useRef("");
  const recordingStartTimeRef = useRef(0);
  const wasSpeakingAtStartRef = useRef(false);

  // -----------------------------------------------------------------------
  // Setters
  // -----------------------------------------------------------------------

  const setIsSpeaking = useCallback((value: boolean) => {
    isSpeakingRef.current = value;
    setIsSpeakingState(value);

    if (!value) {
      // TTS just stopped — record the end timestamp
      ariaSpeakingEndTimeRef.current = Date.now();
    }
  }, []);

  const setIgnoreAll = useCallback((value: boolean) => {
    ignoreAllRef.current = value;
    setIgnoreAllSpeechInput(value);
  }, []);

  const setLastSpokenText = useCallback((text: string) => {
    lastSpokenTextRef.current = text;
  }, []);

  const setRecordingStartTime = useCallback((time: number) => {
    recordingStartTimeRef.current = time;
    // Snapshot whether TTS was active when recording began (L0)
    wasSpeakingAtStartRef.current = isSpeakingRef.current;
  }, []);

  // -----------------------------------------------------------------------
  // 6-Layer filter
  // -----------------------------------------------------------------------

  const shouldDiscardTranscript = useCallback(
    (text: string): DiscardResult => {
      // L0 — Recording started while TTS was playing
      if (wasSpeakingAtStartRef.current) {
        return { discard: true, reason: "L0: recording started during TTS playback" };
      }

      // L1 — TTS is currently playing right now
      if (isSpeakingRef.current) {
        return { discard: true, reason: "L1: TTS is currently playing" };
      }

      // L2 — Global mute flag (e.g. during thinking/response phase)
      if (ignoreAllRef.current) {
        return { discard: true, reason: "L2: all speech input is muted" };
      }

      // L3 — Time-based echo guard
      const guardMs =
        sttMode === "whisper" ? ECHO_GUARD_WHISPER_MS : ECHO_GUARD_WEB_SPEECH_MS;
      const elapsed = Date.now() - ariaSpeakingEndTimeRef.current;
      if (ariaSpeakingEndTimeRef.current > 0 && elapsed < guardMs) {
        return {
          discard: true,
          reason: `L3: echo guard active (${elapsed}ms / ${guardMs}ms)`,
        };
      }

      // L4 — Recording overlap (recording started before TTS ended)
      if (
        recordingStartTimeRef.current > 0 &&
        ariaSpeakingEndTimeRef.current > 0 &&
        recordingStartTimeRef.current < ariaSpeakingEndTimeRef.current
      ) {
        return { discard: true, reason: "L4: recording overlaps with TTS playback" };
      }

      // L5 — Content-based word overlap
      if (lastSpokenTextRef.current) {
        const overlap = wordOverlapRatio(text, lastSpokenTextRef.current);
        if (overlap > WORD_OVERLAP_THRESHOLD) {
          return {
            discard: true,
            reason: `L5: word overlap ${(overlap * 100).toFixed(0)}% exceeds ${WORD_OVERLAP_THRESHOLD * 100}% threshold`,
          };
        }
      }

      return { discard: false, reason: null };
    },
    [sttMode]
  );

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  const reset = useCallback(() => {
    isSpeakingRef.current = false;
    ignoreAllRef.current = false;
    ariaSpeakingEndTimeRef.current = 0;
    lastSpokenTextRef.current = "";
    recordingStartTimeRef.current = 0;
    wasSpeakingAtStartRef.current = false;

    setIsSpeakingState(false);
    setIgnoreAllSpeechInput(false);
  }, []);

  // -----------------------------------------------------------------------
  // Derived state snapshot (for UI consumers)
  // -----------------------------------------------------------------------

  const echoState: EchoState = {
    isSpeaking,
    ignoreAllSpeechInput,
    ariaSpeakingEndTime: ariaSpeakingEndTimeRef.current,
    lastSpokenText: lastSpokenTextRef.current,
    recordingStartTime: recordingStartTimeRef.current,
    wasSpeakingAtStart: wasSpeakingAtStartRef.current,
  };

  return {
    echoState,
    setIsSpeaking,
    setIgnoreAllSpeechInput: setIgnoreAll,
    setLastSpokenText,
    setRecordingStartTime,
    shouldDiscardTranscript,
    reset,
  };
}
