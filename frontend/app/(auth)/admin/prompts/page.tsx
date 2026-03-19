"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPut } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatRelative } from "@/lib/utils";
import type { ManagedPrompt, ManagedPromptDetail, PromptVersion } from "@/lib/types";
import {
  MessageSquareCode,
  Search,
  Scissors,
  GraduationCap,
  Target,
  Building,
  ClipboardList,
  Pencil,
  History,
  X,
  FlaskConical,
  Rocket,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Bot,
} from "lucide-react";

const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  scout: Search,
  tailor: Scissors,
  coach: GraduationCap,
  strategist: Target,
  brand_advisor: Building,
  coordinator: ClipboardList,
};

const agentColors: Record<string, string> = {
  scout: "rgb(59,130,246)",
  tailor: "rgb(139,92,246)",
  coach: "rgb(16,185,129)",
  strategist: "rgb(234,179,8)",
  brand_advisor: "rgb(236,72,153)",
  coordinator: "rgb(249,115,22)",
};

const tierBadge = (tier: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    heavy: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)" },
    standard: { bg: "rgba(59,130,246,0.1)", text: "rgb(59,130,246)" },
    light: { bg: "rgba(16,185,129,0.1)", text: "rgb(16,185,129)" },
  };
  const c = colors[tier] || colors.standard;
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {tier}
    </span>
  );
};

const statusBadge = (status: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    published: { bg: "rgba(16,185,129,0.1)", text: "rgb(16,185,129)" },
    testing: { bg: "rgba(234,179,8,0.1)", text: "rgb(180,140,8)" },
    draft: { bg: "rgba(156,163,175,0.1)", text: "rgb(107,114,128)" },
  };
  const c = colors[status] || colors.draft;
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
};

export default function PromptsPage() {
  const { hasPermission } = useAuth();
  const [prompts, setPrompts] = useState<ManagedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editPrompt, setEditPrompt] = useState<ManagedPromptDetail | null>(null);
  const [historyPrompt, setHistoryPrompt] = useState<ManagedPromptDetail | null>(null);

  const canEdit = hasPermission("prompts", "edit");

  const fetchPrompts = useCallback(async () => {
    try {
      const data = await apiGet<ManagedPrompt[]>("/admin/prompts");
      setPrompts(data);
    } catch (err) {
      console.error("Failed to load prompts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const openEditor = async (promptId: string) => {
    try {
      const detail = await apiGet<ManagedPromptDetail>(`/admin/prompts/${promptId}`);
      setEditPrompt(detail);
    } catch (err) {
      console.error("Failed to load prompt detail:", err);
    }
  };

  const openHistory = async (promptId: string) => {
    try {
      const detail = await apiGet<ManagedPromptDetail>(`/admin/prompts/${promptId}`);
      setHistoryPrompt(detail);
    } catch (err) {
      console.error("Failed to load prompt history:", err);
    }
  };

  // Filter prompts
  const filtered = prompts.filter((p) => {
    if (filterAgent && p.agent_name !== filterAgent) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.agent_name || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Count per agent
  const agentCounts = prompts.reduce(
    (acc, p) => {
      if (p.agent_name) acc[p.agent_name] = (acc[p.agent_name] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded" style={{ backgroundColor: "var(--muted)" }} />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prompt Management</h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          Manage AI agent system prompts. Edit, test, and publish prompts without redeploying.
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => setFilterAgent(null)}
          className="rounded-xl border p-4 text-left transition-colors"
          style={{
            backgroundColor: !filterAgent ? "var(--accent)" : "var(--card)",
            borderColor: !filterAgent ? "var(--primary)" : "var(--border)",
            color: "var(--card-foreground)",
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--primary)" }}><Bot className="h-5 w-5" /></span>
            <span className="text-sm font-medium">All Prompts</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{prompts.length}</p>
        </button>
        {Object.entries(agentCounts).map(([agent, count]) => {
          const Icon = agentIcons[agent] || Bot;
          const color = agentColors[agent] || "var(--primary)";
          const isActive = filterAgent === agent;
          return (
            <button
              key={agent}
              onClick={() => setFilterAgent(isActive ? null : agent)}
              className="rounded-xl border p-4 text-left transition-colors"
              style={{
                backgroundColor: isActive ? "var(--accent)" : "var(--card)",
                borderColor: isActive ? color : "var(--border)",
                color: "var(--card-foreground)",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ color }}><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-medium capitalize">{agent.replace("_", " ")}</span>
              </div>
              <p className="mt-1 text-2xl font-bold">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--muted-foreground)" }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search prompts..."
          className="w-full rounded-md border py-2 pl-10 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
          style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
        />
      </div>

      {/* Prompts table */}
      <div className="overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>Agent</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>Name</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>Tier</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--muted-foreground)" }}>Versions</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--muted-foreground)" }}>Status</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--muted-foreground)" }}>Active</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>Updated</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--muted-foreground)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((prompt) => {
              const Icon = agentIcons[prompt.agent_name || ""] || Bot;
              const color = agentColors[prompt.agent_name || ""] || "var(--primary)";
              return (
                <tr
                  key={prompt.id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span style={{ color }}><Icon className="h-4 w-4" /></span>
                      <span className="capitalize">{(prompt.agent_name || "").replace("_", " ")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">{prompt.name}</span>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {prompt.slug}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">{tierBadge(prompt.model_tier)}</td>
                  <td className="px-4 py-3 text-center">{prompt.version_count}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(prompt.status)}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: prompt.is_active ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                        color: prompt.is_active ? "rgb(16,185,129)" : "rgb(239,68,68)",
                      }}
                    >
                      {prompt.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted-foreground)" }}>
                    {formatRelative(prompt.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => openEditor(prompt.id)}
                          className="rounded p-1.5 transition-colors hover:bg-accent"
                          title="Edit prompt"
                        >
                          <span style={{ color: "var(--muted-foreground)" }}><Pencil className="h-4 w-4" /></span>
                        </button>
                      )}
                      <button
                        onClick={() => openHistory(prompt.id)}
                        className="rounded p-1.5 transition-colors hover:bg-accent"
                        title="Version history"
                        disabled={prompt.version_count === 0}
                        style={{ opacity: prompt.version_count === 0 ? 0.3 : 1 }}
                      >
                        <span style={{ color: "var(--muted-foreground)" }}><History className="h-4 w-4" /></span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>
                  No prompts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Editor modal */}
      {editPrompt && (
        <PromptEditor
          prompt={editPrompt}
          onClose={() => setEditPrompt(null)}
          onSaved={() => {
            setEditPrompt(null);
            fetchPrompts();
          }}
        />
      )}

      {/* History modal */}
      {historyPrompt && (
        <VersionHistoryModal
          prompt={historyPrompt}
          onClose={() => setHistoryPrompt(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Prompt Editor Modal                                                       */
/* -------------------------------------------------------------------------- */

function PromptEditor({
  prompt,
  onClose,
  onSaved,
}: {
  prompt: ManagedPromptDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(prompt.content);
  const [changeSummary, setChangeSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<{
    passed: boolean;
    adversarial_tests: { input: string; passed: boolean; reason: string }[];
  } | null>(null);
  const [error, setError] = useState("");

  const isModified = content !== prompt.content;
  const canPublish = prompt.status === "testing" || testResult?.passed;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setWarnings([]);
    try {
      const result = await apiPut<{ prompt: ManagedPrompt; warnings?: string[] }>(
        `/admin/prompts/${prompt.id}`,
        { content, change_summary: changeSummary, action: "save" },
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

  const Icon = agentIcons[prompt.agent_name || ""] || Bot;
  const color = agentColors[prompt.agent_name || ""] || "var(--primary)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex w-full max-w-4xl flex-col rounded-xl border shadow-lg"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <span style={{ color }}><Icon className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-semibold">{prompt.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{prompt.slug}</span>
                {statusBadge(prompt.status)}
                {tierBadge(prompt.model_tier)}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div
              className="flex items-start gap-2 rounded-md border px-4 py-3"
              style={{ borderColor: "rgb(234,179,8)", backgroundColor: "rgba(234,179,8,0.05)" }}
            >
              <span style={{ color: "rgb(234,179,8)" }}><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /></span>
              <div>
                <p className="text-sm font-medium" style={{ color: "rgb(180,140,8)" }}>Warnings (non-blocking)</p>
                <ul className="mt-1 text-xs space-y-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Test results */}
          {testResult && (
            <div
              className="rounded-md border px-4 py-3"
              style={{
                borderColor: testResult.passed ? "rgb(16,185,129)" : "rgb(239,68,68)",
                backgroundColor: testResult.passed ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)",
              }}
            >
              <div className="flex items-center gap-2">
                {testResult.passed ? (
                  <span style={{ color: "rgb(16,185,129)" }}><CheckCircle2 className="h-4 w-4" /></span>
                ) : (
                  <span style={{ color: "rgb(239,68,68)" }}><AlertTriangle className="h-4 w-4" /></span>
                )}
                <span className="text-sm font-medium">
                  {testResult.passed ? "All tests passed" : "Some tests failed"}
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
              style={{ borderColor: "rgb(239,68,68)", backgroundColor: "rgba(239,68,68,0.05)", color: "rgb(239,68,68)" }}
            >
              {error}
            </div>
          )}

          {/* Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">System Prompt</label>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {content.length} chars
                {isModified && (
                  <span className="ml-2 font-medium" style={{ color: "rgb(234,179,8)" }}>Modified</span>
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
                minHeight: "400px",
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setContent(prompt.content)}
            disabled={!isModified}
            className="rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-30"
            style={{ borderColor: "var(--input)", backgroundColor: "var(--background)" }}
          >
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || (!canPublish && prompt.status !== "testing")}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "rgb(16,185,129)",
                color: "white",
              }}
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

/* -------------------------------------------------------------------------- */
/*  Version History Modal                                                     */
/* -------------------------------------------------------------------------- */

function VersionHistoryModal({
  prompt,
  onClose,
}: {
  prompt: ManagedPromptDetail;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-full max-w-2xl rounded-xl border shadow-lg"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-lg font-semibold">Version History</h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {prompt.name} ({prompt.versions.length} versions)
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Versions */}
        <div className="overflow-y-auto p-6 space-y-4" style={{ maxHeight: "calc(80vh - 80px)" }}>
          {prompt.versions.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: "var(--muted-foreground)" }}>
              No version history yet.
            </p>
          )}
          {prompt.versions.map((version) => (
            <div
              key={version.id}
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">v{version.version}</span>
                  {version.change_summary && (
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      -- {version.change_summary}
                    </span>
                  )}
                </div>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {version.changed_by && `${version.changed_by} -- `}
                  {formatRelative(version.created_at)}
                </span>
              </div>
              <pre
                className="overflow-auto rounded-md p-3 text-xs"
                style={{
                  backgroundColor: "var(--muted)",
                  maxHeight: "160px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {version.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
