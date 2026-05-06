"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Web Speech API type shims — not in default TS DOM lib */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

interface UseSpeechRecognitionOptions {
  onInterim?: (text: string, confidence: number) => void;
  onFinal?: (text: string, confidence: number) => void;
  onSilence?: (durationMs: number) => void;
  silenceThresholdMs?: number;
  lang?: string;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    onInterim,
    onFinal,
    onSilence,
    silenceThresholdMs = 5000,
    lang = "en-US",
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceStartRef = useRef<number>(0);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceStartRef.current = Date.now();
    silenceTimerRef.current = setTimeout(() => {
      const duration = Date.now() - silenceStartRef.current;
      onSilence?.(duration);
    }, silenceThresholdMs);
  }, [silenceThresholdMs, onSilence]);

  const start = useCallback(() => {
    if (!isSupported || recognitionRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      resetSilenceTimer();
    };

    recognition.onresult = (event: any) => {
      resetSilenceTimer();
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        const confidence = result[0].confidence;

        if (result.isFinal) {
          finalTranscript += text;
          onFinal?.(text.trim(), confidence);
        } else {
          interimTranscript += text;
          onInterim?.(text, confidence);
        }
      }

      if (finalTranscript) {
        setTranscript((prev) => (prev ? prev + " " + finalTranscript : finalTranscript));
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        // Expected during silence — don't stop
        return;
      }
      console.error("Speech recognition error:", event.error);
      if (event.error === "aborted") return;
      setIsListening(false);
    };

    recognition.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
          recognitionRef.current = null;
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, lang, onFinal, onInterim, resetSilenceTimer]);

  const stop = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.stop();
    }
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTranscript("");
  }, [stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { isListening, isSupported, transcript, start, stop, reset };
}
