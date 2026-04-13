"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RotateCcw,
} from "lucide-react";

interface Finding {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  remediation: string | null;
  passed: boolean;
}

interface ScanResult {
  findings: Finding[];
  total_checks: number;
  passed: number;
  failed: number;
  score: number;
}

const SEVERITY_CONFIG: Record<string, { icon: typeof ShieldAlert; color: string; bg: string }> = {
  critical: { icon: ShieldAlert, color: "rgb(220,38,38)", bg: "rgba(239,68,68,0.1)" },
  high: { icon: AlertTriangle, color: "rgb(234,88,12)", bg: "rgba(249,115,22,0.1)" },
  medium: { icon: AlertTriangle, color: "rgb(161,98,7)", bg: "rgba(234,179,8,0.1)" },
  low: { icon: Info, color: "rgb(59,130,246)", bg: "rgba(59,130,246,0.1)" },
  info: { icon: CheckCircle2, color: "rgb(5,150,105)", bg: "rgba(16,185,129,0.1)" },
};

export default function SecurityScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);

  const runScan = async (isRescan = false) => {
    if (isRescan) setRescanning(true);
    else setLoading(true);
    try {
      const data = await apiGet<ScanResult>("/admin/security/scan");
      setResult(data);
    } catch (err) {
      console.error("Security scan failed:", err);
    } finally {
      setLoading(false);
      setRescanning(false);
    }
  };

  useEffect(() => {
    runScan();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Security Scan</h1>
        <p style={{ color: "var(--muted-foreground)" }}>Failed to load scan results.</p>
      </div>
    );
  }

  const scoreColor =
    result.score >= 80 ? "rgb(16,185,129)" : result.score >= 50 ? "rgb(234,179,8)" : "rgb(239,68,68)";

  const failedFindings = result.findings.filter((f) => !f.passed);
  const passedFindings = result.findings.filter((f) => f.passed);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Scan</h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Configuration audit for common security vulnerabilities.
          </p>
        </div>
        <button
          onClick={() => runScan(true)}
          disabled={rescanning}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50 shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          {rescanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Rescan
        </button>
      </div>

      {/* Score card */}
      <div
        className="rounded-xl border p-6 flex items-center gap-6"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full shrink-0"
          style={{ backgroundColor: `${scoreColor}15`, border: `3px solid ${scoreColor}` }}
        >
          <span className="text-2xl font-bold" style={{ color: scoreColor }}>
            {result.score}
          </span>
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {result.score >= 80 ? "Good" : result.score >= 50 ? "Needs Attention" : "At Risk"}
          </h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {result.passed} of {result.total_checks} checks passed.
            {result.failed > 0 && ` ${result.failed} issue${result.failed > 1 ? "s" : ""} found.`}
          </p>
        </div>
      </div>

      {/* Failed findings */}
      {failedFindings.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Issues Found</h2>
          <div className="space-y-3">
            {failedFindings.map((f) => {
              const config = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
              const Icon = config.icon;
              return (
                <div
                  key={f.id}
                  className="rounded-xl border p-5"
                  style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5"
                      style={{ backgroundColor: config.bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm">{f.title}</h3>
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{ backgroundColor: config.bg, color: config.color }}
                        >
                          {f.severity}
                        </span>
                        <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                          {f.id}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        {f.description}
                      </p>
                      {f.remediation && (
                        <p className="text-sm mt-2 rounded-md px-3 py-2" style={{ backgroundColor: "var(--accent)" }}>
                          <strong>Fix:</strong> {f.remediation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Passed checks */}
      {passedFindings.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Passed Checks</h2>
          <div className="space-y-2">
            {passedFindings.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg border px-4 py-3"
                style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "rgb(16,185,129)" }} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{f.title}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--muted-foreground)" }}>
                    {f.description}
                  </span>
                </div>
                <span className="text-xs font-mono shrink-0" style={{ color: "var(--muted-foreground)" }}>
                  {f.id}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
