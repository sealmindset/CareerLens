"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ManagedPrompt, ManagedPromptDetail } from "@/lib/types";
import { Search, Bot, X } from "lucide-react";
import { PromptCard, agentIcons, agentColors } from "@/components/prompt-card";
import { PromptEditor } from "@/components/prompt-editor";
import { VersionTimeline } from "@/components/version-timeline";

export default function AIInstructionsPage() {
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

  // Stats
  const publishedCount = prompts.filter((p) => p.status === "published").length;
  const draftCount = prompts.filter((p) => p.status === "draft").length;
  const testingCount = prompts.filter((p) => p.status === "testing").length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded" style={{ backgroundColor: "var(--muted)" }} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border"
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
        <h1 className="text-2xl font-bold tracking-tight">AI Instructions</h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          Manage AI agent system prompts. Edit, test, and publish without redeploying.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => setFilterAgent(null)}
          className="rounded-xl border p-4 text-left transition-all hover:shadow-sm"
          style={{
            backgroundColor: !filterAgent ? "var(--accent)" : "var(--card)",
            borderColor: !filterAgent ? "var(--primary)" : "var(--border)",
            color: "var(--card-foreground)",
          }}
        >
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" style={{ color: "var(--primary)" }} />
            <span className="text-sm font-medium">All Instructions</span>
          </div>
          <p className="mt-1 text-2xl font-bold">{prompts.length}</p>
          <div className="mt-1 flex gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
            <span style={{ color: "rgb(16,185,129)" }}>{publishedCount} published</span>
            {testingCount > 0 && <span style={{ color: "rgb(234,179,8)" }}>{testingCount} testing</span>}
            {draftCount > 0 && <span>{draftCount} draft</span>}
          </div>
        </button>
        {Object.entries(agentCounts).map(([agent, count]) => {
          const Icon = agentIcons[agent] || Bot;
          const color = agentColors[agent] || "var(--primary)";
          const isActive = filterAgent === agent;
          return (
            <button
              key={agent}
              onClick={() => setFilterAgent(isActive ? null : agent)}
              className="rounded-xl border p-4 text-left transition-all hover:shadow-sm"
              style={{
                backgroundColor: isActive ? "var(--accent)" : "var(--card)",
                borderColor: isActive ? color : "var(--border)",
                color: "var(--card-foreground)",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ color }}><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-medium capitalize">
                  {agent.replace(/_/g, " ")}
                </span>
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
          placeholder="Search instructions..."
          className="w-full rounded-md border py-2 pl-10 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
          style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
        />
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((prompt) => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            canEdit={canEdit}
            onEdit={openEditor}
            onHistory={openHistory}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p
          className="py-12 text-center text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          No instructions found.
        </p>
      )}

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
            <div
              className="flex items-center justify-between border-b px-6 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h2 className="text-lg font-semibold">Version History</h2>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {historyPrompt.name} ({historyPrompt.versions.length} versions)
                </p>
              </div>
              <button
                onClick={() => setHistoryPrompt(null)}
                className="rounded p-1 transition-colors hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div
              className="overflow-y-auto p-6"
              style={{ maxHeight: "calc(80vh - 80px)" }}
            >
              <VersionTimeline
                versions={historyPrompt.versions}
                onRestore={(version) => {
                  setHistoryPrompt(null);
                  openEditor(historyPrompt.id).then(() => {
                    // Editor will open fresh — user can restore from the History tab
                  });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
