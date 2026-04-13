"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { SafetyReport, SafetyTestResult } from "@/lib/types";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const SEVERITY_CONFIG: Record<
  string,
  { icon: typeof ShieldAlert; color: string; bg: string }
> = {
  critical: {
    icon: ShieldAlert,
    color: "rgb(220,38,38)",
    bg: "rgba(239,68,68,0.1)",
  },
  high: {
    icon: AlertTriangle,
    color: "rgb(234,88,12)",
    bg: "rgba(249,115,22,0.1)",
  },
  medium: {
    icon: AlertTriangle,
    color: "rgb(161,98,7)",
    bg: "rgba(234,179,8,0.1)",
  },
  low: {
    icon: Info,
    color: "rgb(59,130,246)",
    bg: "rgba(59,130,246,0.1)",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  input_rails: "Input Rails",
  output_rails: "Output Rails",
  topic_rails: "Topic Rails",
  dialog_rails: "Dialog Rails",
  content_rails: "Content Rails",
  encoding_rails: "Encoding Rails",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  input_rails: "Jailbreak, prompt injection, and role switching prevention",
  output_rails: "XSS, script injection, and markdown injection sanitization",
  topic_rails: "Career-domain boundary enforcement",
  dialog_rails: "Multi-turn manipulation and context poisoning defense",
  content_rails: "PII leakage and content fabrication prevention",
  encoding_rails: "Unicode, Base64, and encoding bypass detection",
};

export default function AISafetyPage() {
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  const runTests = async (isRescan = false) => {
    if (isRescan) setRescanning(true);
    else setLoading(true);
    try {
      const data = await apiGet<SafetyReport>("/admin/ai-safety/test");
      setReport(data);
      // Auto-expand categories with failures
      const failedCats = new Set<string>();
      for (const r of data.results) {
        if (!r.passed) failedCats.add(r.category);
      }
      setExpandedCategories(failedCats);
    } catch (err) {
      console.error("AI safety test failed:", err);
    } finally {
      setLoading(false);
      setRescanning(false);
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          className="h-8 w-8 animate-spin"
          style={{ color: "var(--primary)" }}
        />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">
          AI Safety Testing
        </h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          Failed to load test results.
        </p>
      </div>
    );
  }

  const scoreColor =
    report.score >= 90
      ? "rgb(16,185,129)"
      : report.score >= 70
        ? "rgb(234,179,8)"
        : "rgb(239,68,68)";

  // Group results by category
  const byCategory: Record<string, SafetyTestResult[]> = {};
  for (const r of report.results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  const categoryOrder = [
    "input_rails",
    "output_rails",
    "encoding_rails",
    "topic_rails",
    "dialog_rails",
    "content_rails",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            AI Safety Testing
          </h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            NeMo Guardrails adversarial test suite for input, output, and topic
            safety.
          </p>
        </div>
        <button
          onClick={() => runTests(true)}
          disabled={rescanning}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50 shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          {rescanning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Re-run
        </button>
      </div>

      {/* Score card */}
      <div
        className="rounded-xl border p-6 flex items-center gap-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full shrink-0"
          style={{
            backgroundColor: `${scoreColor}15`,
            border: `3px solid ${scoreColor}`,
          }}
        >
          <span className="text-2xl font-bold" style={{ color: scoreColor }}>
            {report.score}
          </span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {report.score >= 90
              ? "Strong"
              : report.score >= 70
                ? "Needs Improvement"
                : "Vulnerable"}
          </h2>
          <p
            className="text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {report.passed} of {report.total_tests} tests passed.
            {report.failed > 0 &&
              ` ${report.failed} issue${report.failed > 1 ? "s" : ""} detected.`}
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="space-y-3">
        {categoryOrder.map((cat) => {
          const tests = byCategory[cat];
          if (!tests) return null;

          const summary = report.summary_by_category[cat];
          const isExpanded = expandedCategories.has(cat);
          const allPassed = summary?.failed === 0;

          return (
            <div
              key={cat}
              className="rounded-xl border overflow-hidden"
              style={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/30"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm">
                      {CATEGORY_LABELS[cat] || cat}
                    </h3>
                    {allPassed ? (
                      <CheckCircle2
                        className="h-4 w-4"
                        style={{ color: "rgb(16,185,129)" }}
                      />
                    ) : (
                      <ShieldAlert
                        className="h-4 w-4"
                        style={{ color: "rgb(239,68,68)" }}
                      />
                    )}
                  </div>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {CATEGORY_DESCRIPTIONS[cat]}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: allPassed
                        ? "rgb(16,185,129)"
                        : "rgb(239,68,68)",
                    }}
                  >
                    {summary?.passed}/{summary?.total}
                  </span>
                  <p
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    passed
                  </p>
                </div>
              </button>

              {/* Expanded test list */}
              {isExpanded && (
                <div
                  className="border-t px-5 py-3 space-y-2"
                  style={{ borderColor: "var(--border)" }}
                >
                  {tests.map((t) => {
                    const config =
                      SEVERITY_CONFIG[t.severity] || SEVERITY_CONFIG.low;
                    const Icon = config.icon;
                    return (
                      <div
                        key={t.id}
                        className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                        style={{
                          backgroundColor: t.passed
                            ? "transparent"
                            : "rgba(239,68,68,0.04)",
                        }}
                      >
                        {t.passed ? (
                          <CheckCircle2
                            className="h-4 w-4 mt-0.5 shrink-0"
                            style={{ color: "rgb(16,185,129)" }}
                          />
                        ) : (
                          <Icon
                            className="h-4 w-4 mt-0.5 shrink-0"
                            style={{ color: config.color }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {t.title}
                            </span>
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                              style={{
                                backgroundColor: config.bg,
                                color: config.color,
                              }}
                            >
                              {t.severity}
                            </span>
                            <span
                              className="text-xs font-mono"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {t.id}
                            </span>
                          </div>
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {t.description}
                          </p>
                          <p
                            className="text-xs mt-1 font-mono"
                            style={{
                              color: t.passed
                                ? "rgb(16,185,129)"
                                : "rgb(239,68,68)",
                            }}
                          >
                            {t.detail}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
