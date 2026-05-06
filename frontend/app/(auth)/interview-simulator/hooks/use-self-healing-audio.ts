"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioPlayer } from "./use-audio-player";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_FAILURES = 3;
const HEALTH_CHECK_INTERVAL_MS = 30_000; // 30s periodic health check
const SPEECH_TIMEOUT_MS = 10_000; // 10s max wait for audio start
const KOKORO_HEALTH_ENDPOINT = "/api/sim/audio/tts/health";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TTSHealthState {
  failureCount: number;
  lastSuccessTime: number;
  isRecovering: boolean;
  kokoroAvailable: boolean;
  synthAvailable: boolean;
}

export interface EchoCallbacks {
  setIsSpeaking: (value: boolean) => void;
  setLastSpokenText: (text: string) => void;
}

export interface UseSelfHealingAudioReturn {
  /** Whether any audio is currently playing */
  isPlaying: boolean;
  /** Play audio from a Kokoro TTS URL with self-healing fallbacks */
  play: (url: string, text?: string) => Promise<void>;
  /** Play text via speechSynthesis with self-healing fallbacks */
  playText: (text: string, voice?: string) => void;
  /** Stop all playback immediately */
  stop: () => void;
  /** Whether the Kokoro TTS backend is reachable */
  kokoroAvailable: boolean;
  /** Current TTS health diagnostics */
  healthState: TTSHealthState;
  /** Manually reset health state (e.g. after user intervention) */
  resetHealth: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function checkSynthAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSelfHealingAudio(
  echoCallbacks: EchoCallbacks,
  onTextFallback?: (text: string) => void
): UseSelfHealingAudioReturn {
  const player = useAudioPlayer();

  // -- Health state ----------------------------------------------------------
  const [healthState, setHealthState] = useState<TTSHealthState>({
    failureCount: 0,
    lastSuccessTime: Date.now(),
    isRecovering: false,
    kokoroAvailable: true,
    synthAvailable: checkSynthAvailable(),
  });

  // Refs mirror state for use inside async callbacks without stale closures
  const healthRef = useRef<TTSHealthState>(healthState);
  healthRef.current = healthState;

  // Track ongoing speech timeout timer
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether component is mounted
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  const clearSpeechTimeout = useCallback(() => {
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  }, []);

  /** Record a successful playback */
  const recordSuccess = useCallback(() => {
    clearSpeechTimeout();
    setHealthState((prev) => ({
      ...prev,
      failureCount: 0,
      lastSuccessTime: Date.now(),
      isRecovering: false,
    }));
  }, [clearSpeechTimeout]);

  /** Record a failure and return the updated failure count */
  const recordFailure = useCallback((): number => {
    clearSpeechTimeout();
    let newCount = 0;
    setHealthState((prev) => {
      newCount = prev.failureCount + 1;
      return {
        ...prev,
        failureCount: newCount,
        isRecovering: newCount >= MAX_FAILURES,
      };
    });
    // Return the projected new count synchronously
    return healthRef.current.failureCount + 1;
  }, [clearSpeechTimeout]);

  // -----------------------------------------------------------------------
  // Recovery: speechSynthesis fallback
  // -----------------------------------------------------------------------

  const playSynthFallback = useCallback(
    (text: string, voice?: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (!checkSynthAvailable()) {
          resolve();
          return;
        }

        echoCallbacks.setLastSpokenText(text);
        echoCallbacks.setIsSpeaking(true);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (voice) {
          const voices = window.speechSynthesis.getVoices();
          const match = voices.find((v) =>
            v.name.toLowerCase().includes(voice.toLowerCase())
          );
          if (match) utterance.voice = match;
        }

        utterance.onend = () => {
          echoCallbacks.setIsSpeaking(false);
          recordSuccess();
          resolve();
        };

        utterance.onerror = () => {
          echoCallbacks.setIsSpeaking(false);
          resolve(); // Don't reject — caller handles text fallback
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [echoCallbacks, recordSuccess]
  );

  // -----------------------------------------------------------------------
  // Recovery sequence
  // -----------------------------------------------------------------------

  /**
   * Attempt recovery in order:
   *   1. Retry Kokoro audio URL
   *   2. Fall back to speechSynthesis
   *   3. Fall back to text-only (fire onTextFallback)
   */
  const attemptRecovery = useCallback(
    async (url: string | null, text: string, voice?: string): Promise<void> => {
      setHealthState((prev) => ({ ...prev, isRecovering: true }));

      // Step 1: Retry Kokoro if URL was provided
      if (url) {
        try {
          echoCallbacks.setLastSpokenText(text);
          echoCallbacks.setIsSpeaking(true);
          await player.play(url);
          echoCallbacks.setIsSpeaking(false);
          recordSuccess();
          return;
        } catch {
          echoCallbacks.setIsSpeaking(false);
          // Kokoro retry failed — continue to next fallback
          setHealthState((prev) => ({ ...prev, kokoroAvailable: false }));
        }
      }

      // Step 2: speechSynthesis fallback
      if (checkSynthAvailable()) {
        try {
          await playSynthFallback(text, voice);
          // recordSuccess is called inside playSynthFallback on success
          return;
        } catch {
          // speechSynthesis also failed
          setHealthState((prev) => ({ ...prev, synthAvailable: false }));
        }
      }

      // Step 3: Text-only fallback
      setHealthState((prev) => ({
        ...prev,
        isRecovering: false,
      }));
      onTextFallback?.(text);
    },
    [player, echoCallbacks, recordSuccess, playSynthFallback, onTextFallback]
  );

  // -----------------------------------------------------------------------
  // play() — Wraps player.play() with healing
  // -----------------------------------------------------------------------

  const play = useCallback(
    async (url: string, text?: string): Promise<void> => {
      const displayText = text ?? "";

      // Set echo cancellation state before playback
      if (displayText) {
        echoCallbacks.setLastSpokenText(displayText);
      }
      echoCallbacks.setIsSpeaking(true);

      // Start speech timeout: if no audio starts within 10s, trigger recovery
      clearSpeechTimeout();
      speechTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        player.stop();
        echoCallbacks.setIsSpeaking(false);
        const count = recordFailure();
        if (count >= MAX_FAILURES && displayText) {
          attemptRecovery(url, displayText);
        }
      }, SPEECH_TIMEOUT_MS);

      try {
        await player.play(url);
        // Playback completed successfully
        clearSpeechTimeout();
        echoCallbacks.setIsSpeaking(false);
        recordSuccess();
      } catch {
        // Playback failed
        echoCallbacks.setIsSpeaking(false);
        const count = recordFailure();

        if (count >= MAX_FAILURES && displayText) {
          await attemptRecovery(url, displayText);
        } else if (count >= MAX_FAILURES && !displayText) {
          // No text available — mark kokoro as down, fire text fallback with
          // a generic message so the UI can indicate the issue
          setHealthState((prev) => ({ ...prev, kokoroAvailable: false }));
          onTextFallback?.("[Audio unavailable]");
        }
      }
    },
    [
      player,
      echoCallbacks,
      clearSpeechTimeout,
      recordSuccess,
      recordFailure,
      attemptRecovery,
      onTextFallback,
    ]
  );

  // -----------------------------------------------------------------------
  // playText() — Wraps player.playText() with healing
  // -----------------------------------------------------------------------

  const playText = useCallback(
    (text: string, voice?: string) => {
      if (!text) return;

      echoCallbacks.setLastSpokenText(text);
      echoCallbacks.setIsSpeaking(true);

      // Start speech timeout
      clearSpeechTimeout();
      speechTimeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        player.stop();
        echoCallbacks.setIsSpeaking(false);
        const count = recordFailure();
        if (count >= MAX_FAILURES) {
          onTextFallback?.(text);
        }
      }, SPEECH_TIMEOUT_MS);

      // We can't directly await speechSynthesis through the existing player,
      // so we observe via a polling check + the player's isPlaying flag.
      // Instead, tap into speechSynthesis directly for event-driven handling.
      if (!checkSynthAvailable()) {
        clearSpeechTimeout();
        echoCallbacks.setIsSpeaking(false);
        recordFailure();
        onTextFallback?.(text);
        return;
      }

      // Use the underlying player for playback but add our own event tracking
      // via a parallel utterance monitor
      player.stop(); // ensure clean slate

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      if (voice) {
        const voices = window.speechSynthesis.getVoices();
        const match = voices.find((v) =>
          v.name.toLowerCase().includes(voice.toLowerCase())
        );
        if (match) utterance.voice = match;
      }

      utterance.onstart = () => {
        // Audio actually started — clear timeout
        clearSpeechTimeout();
      };

      utterance.onend = () => {
        echoCallbacks.setIsSpeaking(false);
        recordSuccess();
      };

      utterance.onerror = () => {
        echoCallbacks.setIsSpeaking(false);
        const count = recordFailure();
        if (count >= MAX_FAILURES) {
          setHealthState((prev) => ({ ...prev, synthAvailable: false }));
          onTextFallback?.(text);
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [
      player,
      echoCallbacks,
      clearSpeechTimeout,
      recordSuccess,
      recordFailure,
      onTextFallback,
    ]
  );

  // -----------------------------------------------------------------------
  // stop() — Stop playback and clear timers
  // -----------------------------------------------------------------------

  const stop = useCallback(() => {
    clearSpeechTimeout();
    player.stop();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    echoCallbacks.setIsSpeaking(false);
  }, [player, echoCallbacks, clearSpeechTimeout]);

  // -----------------------------------------------------------------------
  // resetHealth() — Manual health reset
  // -----------------------------------------------------------------------

  const resetHealth = useCallback(() => {
    clearSpeechTimeout();
    setHealthState({
      failureCount: 0,
      lastSuccessTime: Date.now(),
      isRecovering: false,
      kokoroAvailable: true,
      synthAvailable: checkSynthAvailable(),
    });
  }, [clearSpeechTimeout]);

  // -----------------------------------------------------------------------
  // Periodic health check (every 30s)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const checkKokoroHealth = async () => {
      try {
        const res = await fetch(KOKORO_HEALTH_ENDPOINT, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        const available = res.ok;
        setHealthState((prev) => {
          if (prev.kokoroAvailable !== available) {
            return { ...prev, kokoroAvailable: available };
          }
          return prev;
        });
      } catch {
        setHealthState((prev) => {
          if (prev.kokoroAvailable) {
            return { ...prev, kokoroAvailable: false };
          }
          return prev;
        });
      }
    };

    // Run initial check
    checkKokoroHealth();

    // Schedule periodic checks
    const intervalId = setInterval(checkKokoroHealth, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Clean up speech timeout on unmount
  useEffect(() => {
    return () => {
      clearSpeechTimeout();
    };
  }, [clearSpeechTimeout]);

  // -----------------------------------------------------------------------
  // Return
  // -----------------------------------------------------------------------

  return {
    isPlaying: player.isPlaying,
    play,
    playText,
    stop,
    kokoroAvailable: healthState.kokoroAvailable,
    healthState,
    resetHealth,
  };
}
