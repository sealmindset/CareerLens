"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseWhisperSttOptions {
  onTranscript?: (text: string) => void;
  onError?: (msg: string) => void;
  intervalMs?: number;
}

interface UseWhisperSttReturn {
  isListening: boolean;
  isAvailable: boolean | null;
  transcript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useWhisperStt(
  options: UseWhisperSttOptions = {}
): UseWhisperSttReturn {
  const { onTranscript, onError, intervalMs = 5000 } = options;

  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Check if Whisper server is available
  useEffect(() => {
    fetch("/api/sim/audio/stt/health")
      .then((r) => r.json())
      .then((d) => setIsAvailable(d.whisper_available === true))
      .catch(() => setIsAvailable(false));
  }, []);

  const sendChunk = useCallback(async () => {
    if (chunksRef.current.length === 0) return;

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];

    if (blob.size < 1000) return; // skip near-empty chunks

    const formData = new FormData();
    formData.append("file", blob, "audio.webm");

    try {
      const resp = await fetch("/api/sim/audio/transcribe", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!resp.ok) {
        onError?.(`Transcription failed: ${resp.status}`);
        return;
      }
      const data = await resp.json();
      const text = data.text?.trim();
      if (text) {
        setTranscript((prev) => (prev ? prev + " " + text : text));
        onTranscript?.(text);
      }
    } catch (err) {
      onError?.("Transcription request failed");
    }
  }, [onTranscript, onError]);

  const start = useCallback(async () => {
    if (isListening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(1000); // collect 1s chunks
      setIsListening(true);

      // Send accumulated audio every intervalMs for transcription
      intervalRef.current = setInterval(() => {
        sendChunk();
      }, intervalMs);
    } catch (err) {
      onError?.("Microphone access denied");
    }
  }, [isListening, intervalMs, sendChunk, onError]);

  const stop = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    // Send any remaining audio
    await sendChunk();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setIsListening(false);
  }, [sendChunk]);

  const reset = useCallback(() => {
    stop();
    setTranscript("");
    chunksRef.current = [];
  }, [stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { isListening, isAvailable, transcript, start, stop, reset };
}
