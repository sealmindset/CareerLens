"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type {
  StoryBankStory,
  StoryBankStoryDetail,
  StoryBankStoryVersion,
  StoryBankSummary,
} from "@/lib/types";
import {
  Plus,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  History,
  X,
  Save,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Repeat,
  AlertCircle,
} from "lucide-react";

export default function StoryBankPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("stories", "edit");

  const [stories, setStories] = useState<StoryBankStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [summary, setSummary] = useState<StoryBankSummary | null>(null);

  // Expanded story detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StoryBankStoryDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProblem, setEditProblem] = useState("");
  const [editSolved, setEditSolved] = useState("");
  const [editDeployed, setEditDeployed] = useState("");
  const [editTakeaway, setEditTakeaway] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editHookLine, setEditHookLine] = useState("");
  const [editProofMetric, setEditProofMetric] = useState("");
  const [editChangeSummary, setEditChangeSummary] = useState("");
  const [saving, setSaving] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createBullet, setCreateBullet] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createProblem, setCreateProblem] = useState("");
  const [createSolved, setCreateSolved] = useState("");
  const [createDeployed, setCreateDeployed] = useState("");
  const [createTakeaway, setCreateTakeaway] = useState("");
  const [creating, setCreating] = useState(false);

  // Version history
  const [showVersions, setShowVersions] = useState(false);

  const loadStories = useCallback(async () => {
    try {
      const status = showArchived ? undefined : "active";
      const params = status ? `?status=${status}` : "";
      const data = await apiGet<StoryBankStory[]>(`/stories${params}`);
      setStories(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await apiGet<StoryBankSummary>("/stories/summary");
      setSummary(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadStories();
    loadSummary();
  }, [loadStories, loadSummary]);

  const loadDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await apiGet<StoryBankStoryDetail>(`/stories/${id}`);
      setDetail(data);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setEditingId(null);
      setShowVersions(false);
    } else {
      setExpandedId(id);
      setEditingId(null);
      setShowVersions(false);
      await loadDetail(id);
    }
  };

  const startEditing = (story: StoryBankStoryDetail) => {
    setEditingId(story.id);
    setEditTitle(story.story_title);
    setEditProblem(story.problem);
    setEditSolved(story.solved);
    setEditDeployed(story.deployed);
    setEditTakeaway(story.takeaway || "");
    setEditHookLine(story.hook_line || "");
    setEditProofMetric(story.proof_metric || "");
    setEditChangeSummary("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      await apiPut(`/stories/${editingId}`, {
        story_title: editTitle.trim(),
        problem: editProblem.trim(),
        solved: editSolved.trim(),
        deployed: editDeployed.trim(),
        takeaway: editTakeaway.trim() || null,
        hook_line: editHookLine.trim() || null,
        proof_metric: editProofMetric.trim() || null,
        change_summary: editChangeSummary.trim() || null,
      });
      setEditingId(null);
      await loadDetail(expandedId!);
      await loadStories();
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createBullet.trim() || !createTitle.trim() || !createProblem.trim() || !createSolved.trim() || !createDeployed.trim()) return;
    setCreating(true);
    try {
      await apiPost("/stories", {
        source_bullet: createBullet.trim(),
        story_title: createTitle.trim(),
        problem: createProblem.trim(),
        solved: createSolved.trim(),
        deployed: createDeployed.trim(),
        takeaway: createTakeaway.trim() || null,
      });
      setShowCreate(false);
      setCreateBullet("");
      setCreateTitle("");
      setCreateProblem("");
      setCreateSolved("");
      setCreateDeployed("");
      setCreateTakeaway("");
      await loadStories();
      await loadSummary();
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (id: string) => {
    await apiPut(`/stories/${id}/archive`);
    await loadStories();
    await loadSummary();
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
    }
  };

  const handleRestore = async (id: string) => {
    await apiPut(`/stories/${id}/restore`);
    await loadStories();
    await loadSummary();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this story and all its versions?")) return;
    await apiDelete(`/stories/${id}`);
    await loadStories();
    await loadSummary();
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Story Bank</h1>
          {summary && (
            <span className="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-medium text-primary">
              {summary.active_count} stories
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              showArchived
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {showArchived ? "Show Active Only" : "Show Archived"}
            {summary && summary.archived_count > 0 && !showArchived && (
              <span className="ml-1 text-xs">({summary.archived_count})</span>
            )}
          </button>
          {canEdit && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Story
            </button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Stories", value: summary.total_count },
            { label: "Active", value: summary.active_count },
            { label: "Archived", value: summary.archived_count },
            { label: "Companies", value: summary.unique_companies },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-card p-3 text-center"
            >
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="font-semibold">Add a New Story</h3>
          <div>
            <label className="mb-1 block text-sm font-medium">Resume Bullet *</label>
            <textarea
              value={createBullet}
              onChange={(e) => setCreateBullet(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="The original resume bullet point this story covers..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Story Title *</label>
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Short title (e.g., 'Redis Migration Under Fire')"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Problem (The Hook) *</label>
            <textarea
              value={createProblem}
              onChange={(e) => setCreateProblem(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Lead with a situation the interviewer recognizes..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Solved (The Differentiator) *</label>
            <textarea
              value={createSolved}
              onChange={(e) => setCreateSolved(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Show judgment and approach, not just what happened..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Deployed (The Proof) *</label>
            <textarea
              value={createDeployed}
              onChange={(e) => setCreateDeployed(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Numbers, outcomes, cultural shifts..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Key Takeaway</label>
            <input
              value={createTakeaway}
              onChange={(e) => setCreateTakeaway(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="One sentence the interviewer writes in their notes"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !createBullet.trim() || !createTitle.trim() || !createProblem.trim() || !createSolved.trim() || !createDeployed.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create Story
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {stories.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-muted-foreground">
            {showArchived
              ? "No stories yet. Run the Talking Points agent in Application Studio to generate stories automatically."
              : "No active stories. Try showing archived stories or run the Talking Points agent."}
          </p>
        </div>
      )}

      {/* Story cards */}
      <div className="space-y-3">
        {stories.map((story) => (
          <div
            key={story.id}
            className={`rounded-lg border bg-card transition-colors ${
              story.status === "archived"
                ? "border-amber-200 dark:border-amber-800/40 opacity-75"
                : "border-border"
            }`}
          >
            {/* Card header - always visible */}
            <div
              className="flex cursor-pointer items-start gap-4 p-4"
              onClick={() => toggleExpand(story.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{story.story_title}</h3>
                  {story.status === "archived" && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      Archived
                    </span>
                  )}
                </div>
                {(story.source_title || story.source_company) && (
                  <p className="text-sm text-muted-foreground">
                    {story.source_title}{story.source_title && story.source_company ? " at " : ""}{story.source_company}
                  </p>
                )}
                <p className="mt-1 text-sm italic text-muted-foreground/80 line-clamp-1">
                  {story.source_bullet}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {story.proof_metric && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      {story.proof_metric}
                    </span>
                  )}
                  {story.trigger_keywords?.map((kw) => (
                    <span
                      key={kw}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {kw}
                    </span>
                  ))}
                  {story.times_used > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Repeat className="h-3 w-3" />
                      Used {story.times_used}x
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-muted-foreground">
                {expandedId === story.id ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {expandedId === story.id && (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                {loadingDetail ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : detail && editingId !== story.id ? (
                  <>
                    {/* Read-only view */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">THE PROBLEM (The Hook)</h4>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{detail.problem}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400">HOW I SOLVED IT (The Differentiator)</h4>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{detail.solved}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-green-600 dark:text-green-400">WHAT I DEPLOYED (The Proof)</h4>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{detail.deployed}</p>
                      </div>
                      {detail.takeaway && (
                        <div>
                          <h4 className="text-sm font-semibold">Key Takeaway</h4>
                          <p className="mt-1 text-sm italic">{detail.takeaway}</p>
                        </div>
                      )}
                      {detail.hook_line && (
                        <div className="rounded-md bg-muted/50 p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Quick Hook</p>
                          <p className="text-sm">{detail.hook_line}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      {canEdit && (
                        <>
                          <button
                            onClick={() => startEditing(detail)}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm hover:bg-accent"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          {story.status === "active" ? (
                            <button
                              onClick={() => handleArchive(story.id)}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                            >
                              <Archive className="h-3.5 w-3.5" /> Archive
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRestore(story.id)}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Restore
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(story.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </>
                      )}
                      {detail.versions.length > 0 && (
                        <button
                          onClick={() => setShowVersions(!showVersions)}
                          className="ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                        >
                          <History className="h-3.5 w-3.5" />
                          {detail.versions.length} version{detail.versions.length !== 1 ? "s" : ""}
                        </button>
                      )}
                    </div>

                    {/* Version history */}
                    {showVersions && detail.versions.length > 0 && (
                      <div className="space-y-2 border-t border-border pt-3">
                        <h4 className="text-sm font-semibold">Version History</h4>
                        {detail.versions.map((v) => (
                          <div
                            key={v.id}
                            className="rounded-md border border-border bg-muted/30 p-3 text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Version {v.version_number}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                            </div>
                            {v.change_summary && (
                              <p className="mt-1 text-xs text-muted-foreground italic">{v.change_summary}</p>
                            )}
                            <div className="mt-2 space-y-1 text-xs">
                              <p><span className="font-medium text-red-600 dark:text-red-400">Problem:</span> {v.problem?.slice(0, 120)}...</p>
                              <p><span className="font-medium text-blue-600 dark:text-blue-400">Solved:</span> {v.solved?.slice(0, 120)}...</p>
                              <p><span className="font-medium text-green-600 dark:text-green-400">Deployed:</span> {v.deployed?.slice(0, 120)}...</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : detail && editingId === story.id ? (
                  <>
                    {/* Edit mode */}
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">Story Title</label>
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-red-600 dark:text-red-400">
                          THE PROBLEM (The Hook)
                        </label>
                        <textarea
                          value={editProblem}
                          onChange={(e) => setEditProblem(e.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-blue-600 dark:text-blue-400">
                          HOW I SOLVED IT (The Differentiator)
                        </label>
                        <textarea
                          value={editSolved}
                          onChange={(e) => setEditSolved(e.target.value)}
                          rows={5}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-green-600 dark:text-green-400">
                          WHAT I DEPLOYED (The Proof)
                        </label>
                        <textarea
                          value={editDeployed}
                          onChange={(e) => setEditDeployed(e.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">Key Takeaway</label>
                        <input
                          value={editTakeaway}
                          onChange={(e) => setEditTakeaway(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="One sentence the interviewer writes in their notes"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-sm font-medium">Quick Hook</label>
                          <input
                            value={editHookLine}
                            onChange={(e) => setEditHookLine(e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="One-liner to open the story"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium">Proof Metric</label>
                          <input
                            value={editProofMetric}
                            onChange={(e) => setEditProofMetric(e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Key number or outcome"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">Change Summary</label>
                        <input
                          value={editChangeSummary}
                          onChange={(e) => setEditChangeSummary(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="What changed and why (optional)"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save Changes
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
