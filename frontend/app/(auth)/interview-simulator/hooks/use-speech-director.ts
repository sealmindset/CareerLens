"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Callbacks the hook uses to drive the echo cancellation system. */
export interface EchoCancellationCallbacks {
  setIsSpeaking: (value: boolean) => void;
  setLastSpokenText: (text: string) => void;
  setRecordingStartTime: (time: number) => void;
}

export interface UseSpeechDirectorReturn {
  /** TTS is currently playing (audio element or speechSynthesis). */
  isPlaying: boolean;
  /** Playback is paused (resumable). */
  isPaused: boolean;
  /** Zero-based index of the sentence currently being spoken. */
  currentSentenceIndex: number;
  /** Total number of sentences in the queued text. */
  totalSentences: number;
  /** Text that has been fully spoken so far. */
  spokenText: string;
  /** Text that has not yet been spoken. */
  remainingText: string;
  /** Begin playing `text`, optionally using a Kokoro audio URL. */
  speak: (text: string, audioUrl?: string) => Promise<void>;
  /** Pause playback (resumable via `resume()`). */
  pause: () => void;
  /** Resume previously paused playback. */
  resume: () => void;
  /** Immediately stop playback and return spoken/remaining split. */
  interrupt: () => { spokenText: string; remainingText: string };
  /** Stop playback entirely without returning context. */
  stop: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Split text into sentences on `.` `!` `?` boundaries. */
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!matches) return text.trim() ? [text.trim()] : [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useSpeechDirector(
  echoCallbacks: EchoCancellationCallbacks
): UseSpeechDirectorReturn {
  /* --- State exposed to consumers --------------------------------- */
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [totalSentences, setTotalSentences] = useState(0);
  const [spokenText, setSpokenText] = useState("");
  const [remainingText, setRemainingText] = useState("");

  /* --- Mutable refs for internal state ----------------------------- */
  const sentencesRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const interruptedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);

  // Active playback handles
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kokoro sentence-boundary tracking
  const kokoroStartTimeRef = useRef(0);
  const kokoroPausedAtRef = useRef(0); // elapsed time when paused

  // Keep latest echo callbacks in refs so we never stale-close over them
  const echoRef = useRef(echoCallbacks);
  echoRef.current = echoCallbacks;

  // Promise resolve for the outer `speak()` call
  const speakResolveRef = useRef<(() => void) | null>(null);

  /* --- Derived state helpers --------------------------------------- */

  /** Recompute spokenText / remainingText from sentences + index. */
  const updateTextSplit = useCallback((sentences: string[], index: number) => {
    const spoken = sentences.slice(0, index).join(" ");
    const remaining = sentences.slice(index).join(" ");
    setSpokenText(spoken);
    setRemainingText(remaining);
  }, []);

  /* --- Cleanup active playback ------------------------------------- */

  const cleanupAudioElement = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.removeAttribute("src");
      audioElementRef.current.load();
      audioElementRef.current = null;
    }
  }, []);

  const cleanupSpeechSynthesis = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  const clearSentenceTimer = useCallback(() => {
    if (sentenceTimerRef.current) {
      clearTimeout(sentenceTimerRef.current);
      sentenceTimerRef.current = null;
    }
  }, []);

  const finishPlayback = useCallback(() => {
    isPlayingRef.current = false;
    isPausedRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    echoRef.current.setIsSpeaking(false);

    if (speakResolveRef.current) {
      speakResolveRef.current();
      speakResolveRef.current = null;
    }
  }, []);

  /* --- Stop (full teardown) ---------------------------------------- */

  const stop = useCallback(() => {
    interruptedRef.current = true;
    clearSentenceTimer();
    cleanupAudioElement();
    cleanupSpeechSynthesis();

    // Reset all state
    sentencesRef.current = [];
    currentIndexRef.current = 0;
    kokoroStartTimeRef.current = 0;
    kokoroPausedAtRef.current = 0;

    setCurrentSentenceIndex(0);
    setTotalSentences(0);
    setSpokenText("");
    setRemainingText("");

    finishPlayback();
  }, [clearSentenceTimer, cleanupAudioElement, cleanupSpeechSynthesis, finishPlayback]);

  /* --- Interrupt (stop + return context) --------------------------- */

  const interrupt = useCallback((): { spokenText: string; remainingText: string } => {
    const sentences = sentencesRef.current;
    const idx = currentIndexRef.current;

    let spoken = "";
    let remaining = "";

    if (audioElementRef.current && kokoroStartTimeRef.current > 0) {
      // Kokoro audio: estimate how far we got based on elapsed time
      const audio = audioElementRef.current;
      const duration = audio.duration || 1;
      const currentTime = audio.currentTime || 0;
      const fraction = Math.min(currentTime / duration, 1);

      const fullText = sentences.join(" ");
      const charsSoFar = Math.floor(fullText.length * fraction);

      // Find the sentence boundary closest to charsSoFar
      let charCount = 0;
      let splitIdx = 0;
      for (let i = 0; i < sentences.length; i++) {
        charCount += sentences[i].length + 1; // +1 for space
        if (charCount >= charsSoFar) {
          splitIdx = i + 1;
          break;
        }
      }
      // If we passed all sentences, spoken is everything
      if (charCount < charsSoFar) splitIdx = sentences.length;

      spoken = sentences.slice(0, splitIdx).join(" ");
      remaining = sentences.slice(splitIdx).join(" ");
    } else {
      // speechSynthesis path: we know exact sentence index
      spoken = sentences.slice(0, idx).join(" ");
      remaining = sentences.slice(idx).join(" ");
    }

    // Teardown
    interruptedRef.current = true;
    clearSentenceTimer();
    cleanupAudioElement();
    cleanupSpeechSynthesis();

    setSpokenText(spoken);
    setRemainingText(remaining);

    finishPlayback();

    return { spokenText: spoken, remainingText: remaining };
  }, [clearSentenceTimer, cleanupAudioElement, cleanupSpeechSynthesis, finishPlayback]);

  /* --- Pause / Resume ---------------------------------------------- */

  const pause = useCallback(() => {
    if (!isPlayingRef.current || isPausedRef.current) return;

    isPausedRef.current = true;
    setIsPaused(true);

    if (audioElementRef.current) {
      // Kokoro: pause the audio element and record elapsed time
      kokoroPausedAtRef.current = audioElementRef.current.currentTime;
      audioElementRef.current.pause();
      clearSentenceTimer();
    } else if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
  }, [clearSentenceTimer]);

  const resume = useCallback(() => {
    if (!isPlayingRef.current || !isPausedRef.current) return;

    isPausedRef.current = false;
    setIsPaused(false);

    if (audioElementRef.current) {
      audioElementRef.current.play().catch(() => {
        // If resume fails, treat as end of playback
        finishPlayback();
      });
    } else if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
  }, [finishPlayback]);

  /* --- Kokoro audio playback --------------------------------------- */

  const playKokoro = useCallback(
    (audioUrl: string, sentences: string[]): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        cleanupAudioElement();

        const audio = new Audio(audioUrl);
        audioElementRef.current = audio;

        const fullText = sentences.join(" ");
        const totalChars = fullText.length;

        // When we know the duration, schedule sentence boundary callbacks
        const scheduleSentenceBoundaries = (duration: number) => {
          let charsSoFar = 0;

          for (let i = 0; i < sentences.length; i++) {
            charsSoFar += sentences[i].length;
            const fraction = charsSoFar / totalChars;
            const boundaryTime = fraction * duration * 1000; // ms

            // Schedule index update at the estimated sentence boundary
            if (i < sentences.length - 1) {
              const nextIdx = i + 1;
              sentenceTimerRef.current = setTimeout(() => {
                if (interruptedRef.current) return;
                currentIndexRef.current = nextIdx;
                setCurrentSentenceIndex(nextIdx);
                updateTextSplit(sentences, nextIdx);
              }, boundaryTime);
            }

            // Add a space char for gap between sentences
            charsSoFar += 1;
          }
        };

        audio.onloadedmetadata = () => {
          if (audio.duration && isFinite(audio.duration)) {
            scheduleSentenceBoundaries(audio.duration);
          }
        };

        audio.onended = () => {
          audioElementRef.current = null;
          // Mark all sentences as spoken
          currentIndexRef.current = sentences.length;
          setCurrentSentenceIndex(sentences.length);
          updateTextSplit(sentences, sentences.length);
          resolve();
        };

        audio.onerror = () => {
          audioElementRef.current = null;
          reject(new Error("Kokoro audio playback failed"));
        };

        kokoroStartTimeRef.current = Date.now();
        audio.play().catch((err) => {
          audioElementRef.current = null;
          reject(err);
        });
      });
    },
    [cleanupAudioElement, updateTextSplit]
  );

  /* --- speechSynthesis fallback ------------------------------------ */

  const playSentenceSequentially = useCallback(
    (sentences: string[], startIndex: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          resolve();
          return;
        }

        const playNext = (idx: number) => {
          // Check for interrupt or out-of-bounds
          if (interruptedRef.current || idx >= sentences.length) {
            resolve();
            return;
          }

          // Check for pause — wait and retry
          if (isPausedRef.current) {
            sentenceTimerRef.current = setTimeout(() => playNext(idx), 100);
            return;
          }

          currentIndexRef.current = idx;
          setCurrentSentenceIndex(idx);
          updateTextSplit(sentences, idx);

          const utterance = new SpeechSynthesisUtterance(sentences[idx]);
          utterance.rate = 0.95;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          utteranceRef.current = utterance;

          utterance.onend = () => {
            utteranceRef.current = null;

            // Mark this sentence as spoken
            const nextIdx = idx + 1;
            currentIndexRef.current = nextIdx;
            setCurrentSentenceIndex(nextIdx);
            updateTextSplit(sentences, nextIdx);

            // Check interrupt flag between sentences
            if (interruptedRef.current) {
              resolve();
              return;
            }

            // Play next sentence
            playNext(nextIdx);
          };

          utterance.onerror = () => {
            utteranceRef.current = null;
            // On error, try next sentence rather than failing entirely
            const nextIdx = idx + 1;
            currentIndexRef.current = nextIdx;
            updateTextSplit(sentences, nextIdx);
            playNext(nextIdx);
          };

          window.speechSynthesis.speak(utterance);
        };

        playNext(startIndex);
      });
    },
    [updateTextSplit]
  );

  /* --- Main speak() entry point ------------------------------------ */

  const speak = useCallback(
    async (text: string, audioUrl?: string): Promise<void> => {
      // If already playing, stop first
      if (isPlayingRef.current) {
        stop();
      }

      const trimmed = text.trim();
      if (!trimmed) return;

      const sentences = splitSentences(trimmed);
      if (sentences.length === 0) return;

      // Reset state
      interruptedRef.current = false;
      sentencesRef.current = sentences;
      currentIndexRef.current = 0;
      kokoroStartTimeRef.current = 0;
      kokoroPausedAtRef.current = 0;

      setTotalSentences(sentences.length);
      setCurrentSentenceIndex(0);
      updateTextSplit(sentences, 0);

      // Echo cancellation: tell the system what we are about to say
      echoRef.current.setLastSpokenText(trimmed);
      echoRef.current.setIsSpeaking(true);

      isPlayingRef.current = true;
      isPausedRef.current = false;
      setIsPlaying(true);
      setIsPaused(false);

      return new Promise<void>((resolve) => {
        speakResolveRef.current = resolve;

        const doPlayback = async () => {
          try {
            if (audioUrl) {
              // Kokoro TTS: play the full audio, estimate sentence boundaries
              await playKokoro(audioUrl, sentences);
            } else {
              // speechSynthesis fallback: play sentence-by-sentence
              await playSentenceSequentially(sentences, 0);
            }

            // Playback completed naturally (not interrupted)
            if (!interruptedRef.current) {
              currentIndexRef.current = sentences.length;
              setCurrentSentenceIndex(sentences.length);
              setSpokenText(trimmed);
              setRemainingText("");
              finishPlayback();
            }
          } catch {
            // Playback failed — try speechSynthesis fallback if we were using Kokoro
            if (audioUrl && !interruptedRef.current) {
              try {
                await playSentenceSequentially(sentences, currentIndexRef.current);
                if (!interruptedRef.current) {
                  currentIndexRef.current = sentences.length;
                  setCurrentSentenceIndex(sentences.length);
                  setSpokenText(trimmed);
                  setRemainingText("");
                  finishPlayback();
                }
              } catch {
                finishPlayback();
              }
            } else {
              finishPlayback();
            }
          }
        };

        doPlayback();
      });
    },
    [stop, updateTextSplit, playKokoro, playSentenceSequentially, finishPlayback]
  );

  /* --- Cleanup on unmount ------------------------------------------ */

  useEffect(() => {
    return () => {
      interruptedRef.current = true;
      clearSentenceTimer();
      cleanupAudioElement();
      cleanupSpeechSynthesis();
    };
  }, [clearSentenceTimer, cleanupAudioElement, cleanupSpeechSynthesis]);

  return {
    isPlaying,
    isPaused,
    currentSentenceIndex,
    totalSentences,
    spokenText,
    remainingText,
    speak,
    pause,
    resume,
    interrupt,
    stop,
  };
}
