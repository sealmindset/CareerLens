"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface VADConfig {
  /** dB level above which audio is considered speech (default -35) */
  speechThreshold?: number;
  /** ms of silence before speech-end fires (default 1200) */
  silenceDuration?: number;
  /** ms of speech required before it is confirmed (default 200) */
  minSpeechDuration?: number;
  /** Exponential smoothing alpha — higher = smoother (default 0.9) */
  smoothingFactor?: number;
  /** How often to sample audio levels, in ms (default 50) */
  checkIntervalMs?: number;
  /** AnalyserNode FFT size (default 2048) */
  fftSize?: number;

  /* Callbacks */
  onSpeechStart?: () => void;
  onSpeechEnd?: (durationMs: number) => void;
  onAudioLevel?: (levelDb: number) => void;
}

export interface UseVADReturn {
  /** VAD is actively monitoring the mic */
  isActive: boolean;
  /** User is currently speaking */
  isSpeaking: boolean;
  /** Current smoothed audio level in dB (for visualization) */
  audioLevel: number;
  /** Request mic, create AudioContext + AnalyserNode, start polling */
  start: () => Promise<boolean>;
  /** Tear down everything */
  stop: () => void;
  /** Sample ambient noise for ~3 s, set threshold = median + 10 dB */
  calibrate: () => Promise<{ ambient: number; threshold: number }>;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                          */
/* ------------------------------------------------------------------ */

const DEFAULTS: Required<
  Pick<
    VADConfig,
    | "speechThreshold"
    | "silenceDuration"
    | "minSpeechDuration"
    | "smoothingFactor"
    | "checkIntervalMs"
    | "fftSize"
  >
> = {
  speechThreshold: -35,
  silenceDuration: 1200,
  minSpeechDuration: 200,
  smoothingFactor: 0.9,
  checkIntervalMs: 50,
  fftSize: 2048,
};

const DB_FLOOR = -100;
const CALIBRATION_DURATION_MS = 3000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Compute RMS from a Uint8Array of frequency data (0-255 range). */
function computeRms(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = data[i] / 255;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / data.length);
}

/** Convert an RMS value to decibels, clamped to DB_FLOOR. */
function rmsToDb(rms: number): number {
  if (rms <= 0) return DB_FLOOR;
  const db = 20 * Math.log10(rms);
  return Math.max(db, DB_FLOOR);
}

/** Return the median of a sorted-ascending number array. */
function median(sorted: number[]): number {
  if (sorted.length === 0) return DB_FLOOR;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useVAD(config: VADConfig = {}): UseVADReturn {
  const {
    speechThreshold = DEFAULTS.speechThreshold,
    silenceDuration = DEFAULTS.silenceDuration,
    minSpeechDuration = DEFAULTS.minSpeechDuration,
    smoothingFactor = DEFAULTS.smoothingFactor,
    checkIntervalMs = DEFAULTS.checkIntervalMs,
    fftSize = DEFAULTS.fftSize,
    onSpeechStart,
    onSpeechEnd,
    onAudioLevel,
  } = config;

  /* --- State exposed to consumers --------------------------------- */
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(DB_FLOOR);

  /* --- Refs for mutable internals --------------------------------- */
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smoothedLevelRef = useRef<number>(DB_FLOOR);
  const speechStartTimeRef = useRef<number | null>(null);
  const silenceStartTimeRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  /* Keep latest callback refs so we don't re-create the polling fn. */
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onAudioLevelRef = useRef(onAudioLevel);
  onSpeechStartRef.current = onSpeechStart;
  onSpeechEndRef.current = onSpeechEnd;
  onAudioLevelRef.current = onAudioLevel;

  /* Keep config values in refs too for the same reason. */
  const thresholdRef = useRef(speechThreshold);
  const silenceDurationRef = useRef(silenceDuration);
  const minSpeechDurationRef = useRef(minSpeechDuration);
  const smoothingFactorRef = useRef(smoothingFactor);
  thresholdRef.current = speechThreshold;
  silenceDurationRef.current = silenceDuration;
  minSpeechDurationRef.current = minSpeechDuration;
  smoothingFactorRef.current = smoothingFactor;

  /* --- Acquire mic + create audio graph --------------------------- */
  const acquireMic = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0; // we do our own smoothing

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      sourceRef.current = source;

      return true;
    } catch (err) {
      console.error("[useVAD] Failed to acquire microphone:", err);
      return false;
    }
  }, [fftSize]);

  /* --- Tear down audio resources ---------------------------------- */
  const releaseResources = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    smoothedLevelRef.current = DB_FLOOR;
    speechStartTimeRef.current = null;
    silenceStartTimeRef.current = null;
    isSpeakingRef.current = false;
  }, []);

  /* --- Polling loop that reads audio levels ----------------------- */
  const startPolling = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    intervalRef.current = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);

      const rms = computeRms(dataArray);
      const rawDb = rmsToDb(rms);

      // Exponential smoothing
      const alpha = smoothingFactorRef.current;
      smoothedLevelRef.current =
        alpha * smoothedLevelRef.current + (1 - alpha) * rawDb;
      const level = smoothedLevelRef.current;

      setAudioLevel(level);
      onAudioLevelRef.current?.(level);

      const now = Date.now();
      const aboveThreshold = level > thresholdRef.current;

      if (aboveThreshold) {
        // Reset silence tracking
        silenceStartTimeRef.current = null;

        if (!isSpeakingRef.current) {
          // Potential speech start — record timestamp if first crossing
          if (speechStartTimeRef.current === null) {
            speechStartTimeRef.current = now;
          }

          // Confirm speech if it has lasted long enough
          if (now - speechStartTimeRef.current >= minSpeechDurationRef.current) {
            isSpeakingRef.current = true;
            setIsSpeaking(true);
            onSpeechStartRef.current?.();
          }
        }
      } else {
        // Below threshold — silence
        if (isSpeakingRef.current) {
          // Start tracking silence if not already
          if (silenceStartTimeRef.current === null) {
            silenceStartTimeRef.current = now;
          }

          // Fire speech end after enough silence
          if (now - silenceStartTimeRef.current >= silenceDurationRef.current) {
            const duration =
              speechStartTimeRef.current !== null
                ? now - speechStartTimeRef.current
                : 0;

            isSpeakingRef.current = false;
            setIsSpeaking(false);
            speechStartTimeRef.current = null;
            silenceStartTimeRef.current = null;
            onSpeechEndRef.current?.(duration);
          }
        } else {
          // Not speaking and below threshold — reset pending speech detection
          speechStartTimeRef.current = null;
        }
      }
    }, checkIntervalMs);
  }, [checkIntervalMs]);

  /* --- Public API: start ------------------------------------------ */
  const start = useCallback(async (): Promise<boolean> => {
    if (isActive) return true;

    const ok = await acquireMic();
    if (!ok) return false;

    startPolling();
    setIsActive(true);
    setIsSpeaking(false);
    setAudioLevel(DB_FLOOR);
    return true;
  }, [isActive, acquireMic, startPolling]);

  /* --- Public API: stop ------------------------------------------- */
  const stop = useCallback(() => {
    releaseResources();
    setIsActive(false);
    setIsSpeaking(false);
    setAudioLevel(DB_FLOOR);
  }, [releaseResources]);

  /* --- Public API: calibrate -------------------------------------- */
  const calibrate = useCallback(async (): Promise<{
    ambient: number;
    threshold: number;
  }> => {
    // If VAD is not yet active, acquire mic temporarily
    const needsTempMic = !analyserRef.current;
    if (needsTempMic) {
      const ok = await acquireMic();
      if (!ok) {
        return { ambient: DB_FLOOR, threshold: DEFAULTS.speechThreshold };
      }
    }

    const analyser = analyserRef.current!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const samples: number[] = [];

    return new Promise<{ ambient: number; threshold: number }>((resolve) => {
      const sampleInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const rms = computeRms(dataArray);
        samples.push(rmsToDb(rms));
      }, checkIntervalMs);

      setTimeout(() => {
        clearInterval(sampleInterval);

        // Release temp resources if we acquired them
        if (needsTempMic) {
          releaseResources();
        }

        // Compute median and derive threshold
        const sorted = [...samples].sort((a, b) => a - b);
        const ambientMedian = median(sorted);
        const newThreshold = ambientMedian + 10;

        thresholdRef.current = newThreshold;

        resolve({ ambient: ambientMedian, threshold: newThreshold });
      }, CALIBRATION_DURATION_MS);
    });
  }, [acquireMic, releaseResources, checkIntervalMs]);

  /* --- Cleanup on unmount ----------------------------------------- */
  useEffect(() => {
    return () => {
      releaseResources();
    };
  }, [releaseResources]);

  return {
    isActive,
    isSpeaking,
    audioLevel,
    start,
    stop,
    calibrate,
  };
}
