"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { AnalyticsTrends } from "@/lib/types";
import {
  BarChart3,
  TrendingUp,
  Building,
  Target,
  Briefcase,
  FileText,
  Loader2,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  tailoring: "Tailoring",
  ready_to_review: "Ready to Review",
  submitted: "Submitted",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "rgb(148,163,184)",
  tailoring: "rgb(59,130,246)",
  ready_to_review: "rgb(168,85,247)",
  submitted: "rgb(14,165,233)",
  interviewing: "rgb(234,179,8)",
  offer: "rgb(16,185,129)",
  rejected: "rgb(239,68,68)",
  withdrawn: "rgb(107,114,128)",
};

const MATCH_COLORS = [
  "rgb(239,68,68)",
  "rgb(234,179,8)",
  "rgb(59,130,246)",
  "rgb(16,185,129)",
];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsTrends | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<AnalyticsTrends>("/analytics/trends")
      .then(setData)
      .catch((err) => console.error("Failed to load analytics:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p style={{ color: "var(--muted-foreground)" }}>Failed to load analytics data.</p>
        </div>
      </div>
    );
  }

  const maxFunnel = Math.max(...data.status_funnel.map((s) => s.count), 1);
  const maxWeekly = Math.max(
    ...data.weekly_activity.flatMap((w) => [w.applications, w.jobs]),
    1,
  );
  const maxCompany = Math.max(...data.top_companies.map((c) => c.count), 1);
  const maxMatch = Math.max(...data.match_distribution.map((m) => m.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          Job search trends and application pipeline overview.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Jobs", value: data.total_jobs, icon: Briefcase, color: "var(--primary)" },
          { label: "Total Applications", value: data.total_applications, icon: FileText, color: "rgb(139,92,246)" },
          { label: "Interview Rate", value: `${data.interview_rate}%`, icon: TrendingUp, color: "rgb(234,179,8)" },
          { label: "Offer Rate", value: `${data.offer_rate}%`, icon: Target, color: "rgb(16,185,129)" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border p-6"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                {card.label}
              </p>
              <card.icon className="h-4 w-4" style={{ color: card.color }} />
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status Pipeline */}
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4" style={{ color: "var(--primary)" }} />
            <h2 className="font-semibold">Application Pipeline</h2>
          </div>
          <div className="space-y-3">
            {data.status_funnel.map((s) => (
              <div key={s.status} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{STATUS_LABELS[s.status] || s.status}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--border)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(s.count / maxFunnel) * 100}%`,
                      backgroundColor: STATUS_COLORS[s.status] || "var(--primary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Match Score Distribution */}
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4" style={{ color: "rgb(16,185,129)" }} />
            <h2 className="font-semibold">Match Score Distribution</h2>
            {data.avg_match_score !== null && (
              <span
                className="ml-auto text-sm font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Avg: {data.avg_match_score}%
              </span>
            )}
          </div>
          <div className="flex items-end gap-3 h-40">
            {data.match_distribution.map((bucket, i) => (
              <div key={bucket.range} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-medium">{bucket.count}</span>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${Math.max((bucket.count / maxMatch) * 100, 4)}%`,
                    backgroundColor: MATCH_COLORS[i] || "var(--primary)",
                  }}
                />
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {bucket.range}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Activity */}
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4" style={{ color: "rgb(59,130,246)" }} />
            <h2 className="font-semibold">Weekly Activity</h2>
          </div>
          {data.weekly_activity.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No activity in the last 12 weeks.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-1 h-32">
                {data.weekly_activity.map((w) => (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex flex-col gap-0.5">
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${Math.max((w.jobs / maxWeekly) * 60, 2)}px`,
                          backgroundColor: "rgb(59,130,246)",
                        }}
                        title={`${w.jobs} jobs`}
                      />
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${Math.max((w.applications / maxWeekly) * 60, 2)}px`,
                          backgroundColor: "rgb(139,92,246)",
                        }}
                        title={`${w.applications} applications`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "rgb(59,130,246)" }} />
                  Jobs Added
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "rgb(139,92,246)" }} />
                  Applications
                </span>
              </div>
            </>
          )}
        </div>

        {/* Top Companies */}
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Building className="h-4 w-4" style={{ color: "rgb(249,115,22)" }} />
            <h2 className="font-semibold">Top Companies</h2>
          </div>
          {data.top_companies.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No company data yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.top_companies.map((c) => (
                <div key={c.company} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate">{c.company}</span>
                    <span className="font-medium shrink-0 ml-2">{c.count}</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--border)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(c.count / maxCompany) * 100}%`,
                        backgroundColor: "rgb(249,115,22)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
