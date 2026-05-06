"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface WsQuestion {
  index: number;
  total: number;
  text: string;
  question_type: string | null;
  audio_url: string | null;
}

export interface WsNudge {
  nudge_type: string;
  text: string;
  audio_url: string | null;
}

export interface WsEvalPartial {
  question_index: number;
  filler_count: number;
  pace_wpm: number | null;
  confidence_score: number | null;
}

export type SessionPhase =
  | "connecting"
  | "connected"
  | "question"
  | "listening"
  | "evaluating"
  | "generating_debrief"
  | "complete"
  | "error"
  | "disconnected";

interface UseInterviewWsOptions {
  sessionId: string;
  token: string;
  onQuestion?: (q: WsQuestion) => void;
  onNudge?: (n: WsNudge) => void;
  onEvalPartial?: (e: WsEvalPartial) => void;
  onComplete?: (debriefId: string | null, overallScore: number | null, artifactId: string | null) => void;
  onError?: (msg: string) => void;
}

export function useInterviewWs(options: UseInterviewWsOptions) {
  const { sessionId, token, onQuestion, onNudge, onEvalPartial, onComplete, onError } = options;

  const [phase, setPhase] = useState<SessionPhase>("connecting");
  const [totalQuestions, setTotalQuestions] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const simWsBase = process.env.NEXT_PUBLIC_SIM_WS_URL;
    const url = simWsBase
      ? `${simWsBase}/api/sim/sessions/${sessionId}/live?token=${token}`
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/sim/sessions/${sessionId}/live?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setPhase("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "session_started":
            setTotalQuestions(msg.total_questions);
            setPhase("connected");
            break;
          case "question":
            setPhase("question");
            onQuestion?.(msg);
            break;
          case "nudge":
            onNudge?.(msg);
            break;
          case "evaluation_partial":
            onEvalPartial?.(msg);
            break;
          case "generating_debrief":
            setPhase("generating_debrief");
            break;
          case "session_complete":
            setPhase("complete");
            onComplete?.(msg.debrief_id, msg.overall_score, msg.artifact_id ?? null);
            break;
          case "question_skipped":
            break;
          case "error":
            setPhase("error");
            onError?.(msg.message);
            break;
        }
      } catch {
        console.error("Failed to parse WS message");
      }
    };

    ws.onerror = () => {
      setPhase("error");
      onError?.("WebSocket connection error");
    };

    ws.onclose = () => {
      if (phase !== "complete") {
        setPhase("disconnected");
      }
    };
  }, [sessionId, token, onQuestion, onNudge, onEvalPartial, onComplete, onError, phase]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const sendTranscriptFinal = useCallback(
    (text: string, confidence: number) => {
      send({ type: "transcript_final", text, confidence, timestamp_ms: Date.now() });
    },
    [send]
  );

  const sendTranscriptInterim = useCallback(
    (text: string, confidence: number) => {
      send({ type: "transcript_interim", text, confidence });
    },
    [send]
  );

  const sendSilenceDetected = useCallback(
    (durationMs: number) => {
      send({ type: "silence_detected", duration_ms: durationMs });
    },
    [send]
  );

  const sendResponseComplete = useCallback(() => {
    send({ type: "response_complete" });
    setPhase("evaluating");
  }, [send]);

  const sendSkipQuestion = useCallback(() => {
    send({ type: "skip_question" });
  }, [send]);

  const sendEndSession = useCallback(() => {
    send({ type: "end_session" });
  }, [send]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    phase,
    totalQuestions,
    connect,
    disconnect,
    send,
    sendTranscriptFinal,
    sendTranscriptInterim,
    sendSilenceDetected,
    sendResponseComplete,
    sendSkipQuestion,
    sendEndSession,
  };
}
