"use client";

import { useState } from "react";
import {
  X,
  FlaskConical,
  Rocket,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Bot,
  RotateCcw,
  Save,
} from "lucide-react";
import { apiPut } from "@/lib/api";
import { SafetyIndicator } from "@/components/safety-indicator";
import { VariablePillList } from "@/components/variable-pill";
import { VersionTimeline } from "@/components/version-timeline";
import { agentIcons, agentColors } from "@/components/prompt-card";
import type { ManagedPrompt, ManagedPromptDetail, PromptVersion } from "@/lib/types";

const tierConfig: Record<string, { bg: string; text: string; label: string }> = {
  heavy: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)", label: "Heavy" },
  standard: { bg: "rgba(59,130,246,0.1)", text: "rgb(59,130,246)", label: "Standard" },
  light: { bg: "rgba(16,185,129,0.1)", text: "rgb(16,185,129)", label: "Light" },
};

interface PromptEditorProps {
  prompt: ManagedPromptDetail;
  onClose: () => void;
  onSaved: () => void;
}

export function PromptEditor({ prompt, onClose, onSaved }: PromptEditorProps) {
  const [content, setContent] = useState(prompt.content);
  const [changeSummary, setChangeSummary] = useState("");
  const [name, setName] = useState(prompt.name);
  const [description, setDescription] = useState(prompt.description || "");
  const [temperature, setTemperature] = useState(prompt.temperature);
  const [maxTokens, setMaxTokens] = useState(prompt.max_tokens);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{
    passed: boolean;
    adversarial_tests: { input: string; passed: boolean; reason: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "settings" | "history">("editor");

  const isModified = content !== prompt.content || name !== prompt.name || description !== (prompt.description || "") || temperature !== prompt.temperature || maxTokens !== prompt.max_tokens;
  const canPublish = prompt.status === "testing" || testResult?.passed;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setWarnings([]);
    try {
      const body: Record<string, unknown> = { action: "save" };
      if (content !== prompt.content) {
        body.content = content;
        body.change_summary = changeSummary || undefined;
      }
      if (name !== prompt.name) body.name = name;
      if (description !== (prompt.description || "")) body.description = description;
      if (temperature !== prompt.temperature) body.temperature = temperature;
      if (maxTokens !== prompt.max_tokens) body.max_tokens = maxTokens;

      const result = await apiPut<{ prompt: ManagedPrompt; warnings?: string[] }>(
        `/admin/prompts/${prompt.id}`,
        body,
      );
      if (result.warnings) setWarnings(result.warnings);
      onSaved();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 422) {
        setError("Content blocked by safety validation. Remove unsafe patterns and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError("");
    try {
      const result = await apiPut<{
        passed: boolean;
        validation: { warnings: string[] };
        adversarial_tests: { input: string; passed: boolean; reason: string }[];
      }>(`/admin/prompts/${prompt.id}`, { action: "test" });
      setTestResult(result);
      if (result.validation?.warnings) setWarnings(result.validation.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError("");
    try {
      await apiPut(`/admin/prompts/${prompt.id}`, { action: "publish" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const handleRestore = (version: PromptVersion) => {
    setContent(version.content);
    setActiveTab("editor");
  };

  const Icon = agentIcons[prompt.agent_name || ""] || Bot;
  const color = agentColors[prompt.agent_name || ""] || "var(--primary)";
  const tier = tierConfig[prompt.model_tier] || tierConfig.standard;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex w-full max-w-5xl flex-col rounded-xl border shadow-lg"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
          maxHeight: "92vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}15`, color }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{prompt.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {prompt.slug}
                </span>
                <SafetyIndicator status={prompt.status} size="sm" />
                <span
                  className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: tier.bg, color: tier.text }}
                >
                  {tier.label}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
          {(["editor", "settings", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2.5 text-sm font-medium capitalize transition-colors"
              style={{
                borderBottom: activeTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
                color: activeTab === tab ? "var(--foreground)" : "var(--muted-foreground)",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Warnings banner */}
          {warnings.length > 0 && (
            <div
              className="flex items-start gap-2 rounded-md border px-4 py-3"
              style={{ borderColor: "rgb(234,179,8)", backgroundColor: "rgba(234,179,8,0.05)" }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "rgb(234,179,8)" }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "rgb(180,140,8)" }}>
                  Warnings (non-blocking)
                </p>
                <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Test results */}
          {testResult && activeTab === "editor" && (
            <div
              className="rounded-md border px-4 py-3"
              style={{
                borderColor: testResult.passed ? "rgb(16,185,129)" : "rgb(239,68,68)",
                backgroundColor: testResult.passed ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
              }}
            >
              <div className="flex items-center gap-2">
                {testResult.passed ? (
                  <CheckCircle2 className="h-4 w-4" style={{ color: "rgb(16,185,129)" }} />
                ) : (
                  <AlertTriangle className="h-4 w-4" style={{ color: "rgb(239,68,68)" }} />
                )}
                <span className="text-sm font-medium">
                  {testResult.passed ? "All safety tests passed" : "Some safety tests failed"}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {testResult.adversarial_tests.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span style={{ color: t.passed ? "rgb(16,185,129)" : "rgb(239,68,68)" }}>
                      {t.passed ? "PASS" : "FAIL"}
                    </span>
                    <span style={{ color: "var(--muted-foreground)" }}>{t.input}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="rounded-md border px-4 py-3 text-sm"
              style={{
                borderColor: "rgb(239,68,68)",
                backgroundColor: "rgba(239,68,68,0.05)",
                color: "rgb(239,68,68)",
              }}
            >
              {error}
            </div>
          )}

          {/* Editor tab */}
          {activeTab === "editor" && (
            <>
              {/* Variable pills */}
              <VariablePillList content={content} className="pb-1" />

              {/* Textarea */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-medium">System Prompt</label>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {content.length} chars
                    {isModified && (
                      <span className="ml-2 font-medium" style={{ color: "rgb(234,179,8)" }}>
                        Modified
                      </span>
                    )}
                  </span>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-md border p-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                    minHeight: "350px",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Change summary */}
              <div>
                <label className="text-sm font-medium">Change Summary (optional)</label>
                <input
                  type="text"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe what you changed..."
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                />
              </div>
            </>
          )}

          {/* Settings tab */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                    resize: "vertical",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Temperature</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-10 text-right text-sm font-mono" style={{ color: "var(--muted-foreground)" }}>
                      {temperature.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Max Tokens</label>
                  <input
                    type="number"
                    min="256"
                    max="32768"
                    step="256"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 2048)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                  />
                </div>
              </div>
              <div className="rounded-md p-3 text-xs" style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}>
                <p><strong>Agent:</strong> {prompt.agent_name || "none"}</p>
                <p><strong>Category:</strong> {prompt.category}</p>
                <p><strong>Model tier:</strong> {prompt.model_tier}</p>
                <p><strong>Slug:</strong> {prompt.slug} (read-only)</p>
              </div>
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <VersionTimeline
              versions={prompt.versions}
              onRestore={handleRestore}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={() => {
              setContent(prompt.content);
              setName(prompt.name);
              setDescription(prompt.description || "");
              setTemperature(prompt.temperature);
              setMaxTokens(prompt.max_tokens);
            }}
            disabled={!isModified}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-30"
            style={{ borderColor: "var(--input)", backgroundColor: "var(--background)" }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
              style={{ borderColor: "var(--input)", backgroundColor: "var(--background)" }}
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Test
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isModified}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || (!canPublish && prompt.status !== "testing")}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              style={{ backgroundColor: "rgb(16,185,129)", color: "white" }}
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Publish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
