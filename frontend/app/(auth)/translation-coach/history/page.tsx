"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Languages,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionHistoryItem {
  id: string;
  started_at: string;
  completed_at: string | null;
  question_count: number;
  avg_drift_score: number | null;
}

interface TrendData {
  sessions: SessionHistoryItem[];
  overall_avg: number | null;
  total_attempts: number;
  improvement_pct: number | null;
}

interface AttemptSummary {
  id: string;
  drift_score: number;
  signal: string;
  custom_question: string | null;
  flagged_phrases: { original: string; suggested: string }[] | null;
  created_at: string;
}

interface SessionDetail {
  id: string;
  attempts: AttemptSummary[];
}

// ---------------------------------------------------------------------------
// SVG Trend Line
// ---------------------------------------------------------------------------

function TrendLine({ sessions }: { sessions: SessionHistoryItem[] }) {
  const scored = sessions.filter((s) => s.avg_drift_score != null);
  if (scored.length < 2) {
    return (
      <div className="text-sm text-center py-8" style={{ color: "var(--muted-foreground)" }}>
        Complete at least 2 sessions to see your trend line.
      </div>
    );
  }

  const W = 600;
  const H = 200;
  const PAD = 40;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  const points = scored.map((s, i) => ({
    x: PAD + (i / (scored.length - 1)) * plotW,
    y: PAD + plotH - (s.avg_drift_score! * plotH),
    score: s.avg_drift_score!,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Threshold lines
  const greenY = PAD + plotH - 0.75 * plotH;
  const amberY = PAD + plotH - 0.45 * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl mx-auto" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => {
        const y = PAD + plotH - v * plotH;
        return (
          <g key={v}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--border)" strokeWidth={0.5} />
            <text x={PAD - 4} y={y + 4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {Math.round(v * 100)}%
            </text>
          </g>
        );
      })}

      {/* Threshold zones */}
      <rect x={PAD} y={PAD} width={plotW} height={greenY - PAD} fill="rgba(34,197,94,0.05)" />
      <rect x={PAD} y={greenY} width={plotW} height={amberY - greenY} fill="rgba(234,179,8,0.05)" />
      <rect x={PAD} y={amberY} width={plotW} height={PAD + plotH - amberY} fill="rgba(239,68,68,0.05)" />

      {/* Threshold lines */}
      <line x1={PAD} y1={greenY} x2={W - PAD} y2={greenY} stroke="rgb(34,197,94)" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
      <line x1={PAD} y1={amberY} x2={W - PAD} y2={amberY} stroke="rgb(234,179,8)" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />

      {/* Data line */}
      <path d={pathD} fill="none" stroke="rgb(168,85,247)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} fill="var(--card)" stroke={
            p.score >= 0.75 ? "rgb(34,197,94)" : p.score >= 0.45 ? "rgb(234,179,8)" : "rgb(239,68,68)"
          } strokeWidth={2.5} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={10} fontWeight="bold" fill="var(--foreground)">
            {Math.round(p.score * 100)}%
          </text>
        </g>
      ))}

      {/* Axis labels */}
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
        Session →
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TranslationCoachHistoryPage() {
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedAttempts, setExpandedAttempts] = useState<AttemptSummary[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    apiGet<TrendData>("/translation-coach/history")
      .then(setTrend)
      .catch(() => setTrend(null))
      .finally(() => setLoading(false));
  }, []);

  const expandSession = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setLoadingDetail(true);
    try {
      const detail = await apiGet<SessionDetail>(`/translation-coach/sessions/${id}`);
      setExpandedAttempts(detail.attempts || []);
    } catch {
      setExpandedAttempts([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--muted-foreground)" }} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/translation-coach"
            className="inline-flex items-center gap-1 text-sm mb-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ArrowLeft className="h-3 w-3" /> Back to Translation Coach
          </Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Languages className="h-6 w-6 text-purple-500" />
            Session History
          </h1>
        </div>
      </div>

      {/* Stats cards */}
      {trend && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              Total Sessions
            </div>
            <div className="text-2xl font-bold mt-1">{trend.sessions.length}</div>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              Total Attempts
            </div>
            <div className="text-2xl font-bold mt-1">{trend.total_attempts}</div>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
              Improvement
            </div>
            <div className="text-2xl font-bold mt-1 flex items-center gap-1">
              {trend.improvement_pct != null ? (
                <>
                  {trend.improvement_pct > 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  )}
                  {trend.improvement_pct > 0 ? "+" : ""}
                  {trend.improvement_pct}%
                </>
              ) : (
                <span className="text-sm font-normal" style={{ color: "var(--muted-foreground)" }}>
                  Need 6+ sessions
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trend line */}
      {trend && trend.sessions.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="text-sm font-medium mb-4">Score Trend</div>
          <TrendLine sessions={trend.sessions} />
        </div>
      )}

      {/* Sessions list */}
      {trend && trend.sessions.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">All Sessions</div>
          {[...trend.sessions].reverse().map((s) => {
            const signal =
              s.avg_drift_score == null
                ? null
                : s.avg_drift_score >= 0.75
                ? "green"
                : s.avg_drift_score >= 0.45
                ? "amber"
                : "red";
            const dotColor =
              signal === "green"
                ? "bg-green-500"
                : signal === "amber"
                ? "bg-amber-500"
                : signal === "red"
                ? "bg-red-500"
                : "bg-gray-400";

            return (
              <div key={s.id}>
                <button
                  onClick={() => expandSession(s.id)}
                  className="w-full rounded-lg border p-3 flex items-center gap-3 text-left hover:bg-purple-500/5 transition-colors"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {formatDateTime(s.started_at)}
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {s.question_count} question{s.question_count !== 1 ? "s" : ""} •{" "}
                      {s.completed_at ? "Completed" : "In progress"}
                    </div>
                  </div>
                  <div className="text-sm font-bold">
                    {s.avg_drift_score != null ? `${Math.round(s.avg_drift_score * 100)}%` : "—"}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${expandedId === s.id ? "rotate-180" : ""}`}
                    style={{ color: "var(--muted-foreground)" }}
                  />
                </button>

                {/* Expanded attempts */}
                {expandedId === s.id && (
                  <div className="ml-6 mt-1 mb-2 space-y-1">
                    {loadingDetail ? (
                      <div className="py-2 text-xs flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                      </div>
                    ) : expandedAttempts.length === 0 ? (
                      <div className="py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        No attempts in this session.
                      </div>
                    ) : (
                      expandedAttempts.map((a, i) => (
                        <div
                          key={a.id}
                          className="rounded border p-2 flex items-center gap-2 text-xs"
                          style={{ borderColor: "var(--border)" }}
                        >
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              a.signal === "green"
                                ? "bg-green-500"
                                : a.signal === "amber"
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                          />
                          <span className="flex-1 truncate" style={{ color: "var(--foreground)" }}>
                            Q{i + 1}
                          </span>
                          <span style={{ color: "var(--muted-foreground)" }}>
                            {a.flagged_phrases?.length || 0} flagged
                          </span>
                          <span className="font-bold">{Math.round(a.drift_score * 100)}%</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12" style={{ color: "var(--muted-foreground)" }}>
          <Languages className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <div className="text-sm">No sessions yet. Start practicing to see your history.</div>
          <Link
            href="/translation-coach"
            className="inline-block mt-3 text-sm text-purple-600 hover:underline"
          >
            Start your first session →
          </Link>
        </div>
      )}
    </div>
  );
}
