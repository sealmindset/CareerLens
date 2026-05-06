"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "./use-speech-recognition";
import { useWhisperStt } from "./use-whisper-stt";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "interview-stt-mode";
const MAX_CONSECUTIVE_ERRORS = 3;
const WHISPER_HEALTH_URL = "/api/sim/audio/stt/health";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SttMode = "webspeech" | "whisper" | "none";

export interface EchoFilterResult {
  discard: boolean;
  reason: string | null;
}

export interface UseUnifiedSttOptions {
  /** Language code for Web Speech API (default: "en-US") */
  lang?: string;
  /** Whisper chunk upload interval in ms (default: 5000) */
  whisperIntervalMs?: number;
  /** Silence threshold for Web Speech API in ms (default: 5000) */
  silenceThresholdMs?: number;
  /** Echo filter function -- transcripts are discarded when it returns discard:true */
  echoFilter?: (text: string) => EchoFilterResult;
  /** Fired on each interim (partial) transcript */
  onInterim?: (text: string, confidence: number) => void;
  /** Fired on each final transcript */
  onFinal?: (text: string, confidence: number) => void;
  /** Fired when silence is detected */
  onSilence?: (durationMs: number) => void;
  /** Fired when the hook auto-switches providers after repeated failures */
  onProviderSwitch?: (
    from: SttMode,
    to: SttMode,
    reason: string
  ) => void;
  /** Fired when a transcript is discarded by the echo filter */
  onEchoDiscarded?: (text: string, reason: string) => void;
}

export interface UseUnifiedSttReturn {
  /** Whether any provider is actively listening */
  isListening: boolean;
  /** Current active STT mode */
  mode: SttMode;
  /** Combined transcript accumulated across providers */
  transcript: string;
  /** Which STT modes are available on this device/browser */
  availableModes: SttMode[];
  /** Start listening with the current provider */
  start: () => Promise<boolean>;
  /** Stop listening */
  stop: () => void;
  /** Manually switch STT mode (persists to localStorage) */
  setMode: (mode: SttMode) => void;
  /** Reset transcript and error counters */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectWebSpeechSupport(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

function loadPersistedMode(): SttMode | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "webspeech" || stored === "whisper") return stored;
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }
  return null;
}

function persistMode(mode: SttMode): void {
  if (typeof window === "undefined") return;
  try {
    if (mode === "none") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {
    // silently ignore
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUnifiedStt(
  options: UseUnifiedSttOptions = {}
): UseUnifiedSttReturn {
  const {
    lang = "en-US",
    whisperIntervalMs = 5000,
    silenceThresholdMs = 5000,
    echoFilter,
    onInterim,
    onFinal,
    onSilence,
    onProviderSwitch,
    onEchoDiscarded,
  } = options;

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [mode, setModeState] = useState<SttMode>("none");
  const [transcript, setTranscript] = useState("");
  const [webSpeechSupported, setWebSpeechSupported] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const [initDone, setInitDone] = useState(false);

  // Refs for stable access inside callbacks
  const modeRef = useRef<SttMode>("none");
  const echoFilterRef = useRef(echoFilter);
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onSilenceRef = useRef(onSilence);
  const onProviderSwitchRef = useRef(onProviderSwitch);
  const onEchoDiscardedRef = useRef(onEchoDiscarded);
  const errorCountRef = useRef(0);
  const isListeningRef = useRef(false);
  const switchingRef = useRef(false);

  // Keep refs in sync with latest callback props
  useEffect(() => { echoFilterRef.current = echoFilter; }, [echoFilter]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onSilenceRef.current = onSilence; }, [onSilence]);
  useEffect(() => { onProviderSwitchRef.current = onProviderSwitch; }, [onProviderSwitch]);
  useEffect(() => { onEchoDiscardedRef.current = onEchoDiscarded; }, [onEchoDiscarded]);

  // -----------------------------------------------------------------------
  // Echo-filtered callback wrappers
  // -----------------------------------------------------------------------

  const applyEchoFilter = useCallback(
    (text: string): boolean => {
      const filter = echoFilterRef.current;
      if (!filter) return false; // no filter = accept all

      const result = filter(text);
      if (result.discard) {
        onEchoDiscardedRef.current?.(text, result.reason ?? "unknown");
        return true; // discarded
      }
      return false; // accepted
    },
    []
  );

  // -----------------------------------------------------------------------
  // Error tracking & auto-switch
  // -----------------------------------------------------------------------

  const recordError = useCallback(
    (errorMsg: string) => {
      errorCountRef.current += 1;
      console.warn(
        `[useUnifiedStt] ${modeRef.current} error #${errorCountRef.current}: ${errorMsg}`
      );

      if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS && !switchingRef.current) {
        switchingRef.current = true;
        const currentMode = modeRef.current;
        let targetMode: SttMode = "none";

        if (currentMode === "webspeech" && whisperAvailable) {
          targetMode = "whisper";
        } else if (currentMode === "whisper" && webSpeechSupported) {
          targetMode = "webspeech";
        }

        if (targetMode !== "none") {
          const reason = `${MAX_CONSECUTIVE_ERRORS} consecutive errors on ${currentMode}`;
          console.warn(
            `[useUnifiedStt] Auto-switching from ${currentMode} to ${targetMode}: ${reason}`
          );
          onProviderSwitchRef.current?.(currentMode, targetMode, reason);
          errorCountRef.current = 0;
          modeRef.current = targetMode;
          setModeState(targetMode);
          persistMode(targetMode);
        }

        switchingRef.current = false;
      }
    },
    [whisperAvailable, webSpeechSupported]
  );

  const clearErrors = useCallback(() => {
    errorCountRef.current = 0;
  }, []);

  // -----------------------------------------------------------------------
  // Web Speech API callbacks
  // -----------------------------------------------------------------------

  const handleWebSpeechInterim = useCallback(
    (text: string, confidence: number) => {
      if (modeRef.current !== "webspeech") return;
      clearErrors();

      if (applyEchoFilter(text)) return;
      onInterimRef.current?.(text, confidence);
    },
    [applyEchoFilter, clearErrors]
  );

  const handleWebSpeechFinal = useCallback(
    (text: string, confidence: number) => {
      if (modeRef.current !== "webspeech") return;
      clearErrors();

      if (applyEchoFilter(text)) return;

      setTranscript((prev) => (prev ? prev + " " + text : text));
      onFinalRef.current?.(text, confidence);
    },
    [applyEchoFilter, clearErrors]
  );

  const handleWebSpeechSilence = useCallback(
    (durationMs: number) => {
      if (modeRef.current !== "webspeech") return;
      onSilenceRef.current?.(durationMs);
    },
    []
  );

  // -----------------------------------------------------------------------
  // Whisper callbacks
  // -----------------------------------------------------------------------

  const handleWhisperTranscript = useCallback(
    (text: string) => {
      if (modeRef.current !== "whisper") return;
      clearErrors();

      if (applyEchoFilter(text)) return;

      // Whisper returns final results only (no interim/confidence separation)
      setTranscript((prev) => (prev ? prev + " " + text : text));
      onFinalRef.current?.(text, 1.0);
    },
    [applyEchoFilter, clearErrors]
  );

  const handleWhisperError = useCallback(
    (msg: string) => {
      if (modeRef.current !== "whisper") return;
      recordError(msg);
    },
    [recordError]
  );

  // -----------------------------------------------------------------------
  // Underlying hooks
  // -----------------------------------------------------------------------

  const webSpeech = useSpeechRecognition({
    onInterim: handleWebSpeechInterim,
    onFinal: handleWebSpeechFinal,
    onSilence: handleWebSpeechSilence,
    silenceThresholdMs,
    lang,
  });

  const whisper = useWhisperStt({
    onTranscript: handleWhisperTranscript,
    onError: handleWhisperError,
    intervalMs: whisperIntervalMs,
  });

  // -----------------------------------------------------------------------
  // Track Web Speech errors via the isListening drop (recognition.onerror
  // causes isListening to go false unexpectedly)
  // -----------------------------------------------------------------------

  const prevWebSpeechListening = useRef(false);
  useEffect(() => {
    if (
      modeRef.current === "webspeech" &&
      prevWebSpeechListening.current &&
      !webSpeech.isListening &&
      isListeningRef.current
    ) {
      // Web Speech stopped unexpectedly while we expect it to be listening
      recordError("Web Speech API stopped unexpectedly");
    }
    prevWebSpeechListening.current = webSpeech.isListening;
  }, [webSpeech.isListening, recordError]);

  // -----------------------------------------------------------------------
  // Initialization: detect capabilities, resolve default mode
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    const webSupported = detectWebSpeechSupport();
    setWebSpeechSupported(webSupported);

    // Check Whisper health
    fetch(WHISPER_HEALTH_URL)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const available = d.whisper_available === true;
        setWhisperAvailable(available);
        resolveDefaultMode(webSupported, available);
      })
      .catch(() => {
        if (cancelled) return;
        setWhisperAvailable(false);
        resolveDefaultMode(webSupported, false);
      });

    function resolveDefaultMode(web: boolean, wh: boolean) {
      const persisted = loadPersistedMode();

      // Validate persisted preference against current availability
      if (persisted === "webspeech" && web) {
        modeRef.current = "webspeech";
        setModeState("webspeech");
      } else if (persisted === "whisper" && wh) {
        modeRef.current = "whisper";
        setModeState("whisper");
      } else if (web) {
        // Default: Web Speech if supported (Chrome/Edge)
        modeRef.current = "webspeech";
        setModeState("webspeech");
        persistMode("webspeech");
      } else if (wh) {
        // Fallback: Whisper
        modeRef.current = "whisper";
        setModeState("whisper");
        persistMode("whisper");
      } else {
        modeRef.current = "none";
        setModeState("none");
      }

      setInitDone(true);
    }

    return () => {
      cancelled = true;
    };
  }, []); // run once on mount

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const start = useCallback(async (): Promise<boolean> => {
    if (modeRef.current === "none") {
      console.warn("[useUnifiedStt] No STT provider available");
      return false;
    }

    errorCountRef.current = 0;
    isListeningRef.current = true;

    if (modeRef.current === "webspeech") {
      webSpeech.start();
      return true;
    }

    if (modeRef.current === "whisper") {
      await whisper.start();
      return true;
    }

    return false;
  }, [webSpeech, whisper]);

  const stop = useCallback(() => {
    isListeningRef.current = false;

    if (modeRef.current === "webspeech" || webSpeech.isListening) {
      webSpeech.stop();
    }
    if (modeRef.current === "whisper" || whisper.isListening) {
      whisper.stop();
    }
  }, [webSpeech, whisper]);

  const setMode = useCallback(
    (newMode: SttMode) => {
      if (newMode === modeRef.current) return;

      // Validate the requested mode is available
      if (newMode === "webspeech" && !webSpeechSupported) {
        console.warn("[useUnifiedStt] Web Speech API not supported on this browser");
        return;
      }
      if (newMode === "whisper" && !whisperAvailable) {
        console.warn("[useUnifiedStt] Whisper STT not available");
        return;
      }

      const wasListening = isListeningRef.current;
      const previousMode = modeRef.current;

      // Stop current provider if listening
      if (wasListening) {
        if (previousMode === "webspeech") webSpeech.stop();
        if (previousMode === "whisper") whisper.stop();
      }

      // Switch
      modeRef.current = newMode;
      setModeState(newMode);
      persistMode(newMode);
      errorCountRef.current = 0;

      // Restart with new provider if was listening
      if (wasListening && newMode !== "none") {
        if (newMode === "webspeech") {
          webSpeech.start();
        } else if (newMode === "whisper") {
          whisper.start();
        }
      }
    },
    [webSpeechSupported, whisperAvailable, webSpeech, whisper]
  );

  const reset = useCallback(() => {
    stop();
    setTranscript("");
    errorCountRef.current = 0;
    webSpeech.reset();
    whisper.reset();
  }, [stop, webSpeech, whisper]);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------

  const isListening =
    mode === "webspeech"
      ? webSpeech.isListening
      : mode === "whisper"
        ? whisper.isListening
        : false;

  const availableModes: SttMode[] = [];
  if (webSpeechSupported) availableModes.push("webspeech");
  if (whisperAvailable) availableModes.push("whisper");

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
    };
  }, []);

  return {
    isListening,
    mode,
    transcript,
    availableModes,
    start,
    stop,
    setMode,
    reset,
  };
}
