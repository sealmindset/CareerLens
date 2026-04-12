"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { MarkdownContent } from "@/components/markdown-content";
import type {
  StoryBankStory,
  StoryBankStoryDetail,
  StoryBankStoryVersion,
  StoryBankSummary,
  StoryAIResponse,
  PropagateTarget,
  PropagatePreviewResponse,
  PropagateApplyResponse,
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
  Sparkles,
  Send,
  ArrowLeft,
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

  // Ask AI modal state
  const [aiModalStory, setAiModalStory] = useState<StoryBankStoryDetail | null>(null);
  const [aiHistory, setAiHistory] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPhase, setAiPhase] = useState<"interview" | "chat" | "compare" | "propagate">("interview");
  const [revisedStory, setRevisedStory] = useState<{
    problem: string;
    solved: string;
    deployed: string;
    takeaway: string;
  } | null>(null);
  const [editingRevised, setEditingRevised] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Propagate (feedback loop) state
  const [propagateTargets, setPropagateTargets] = useState<PropagateTarget[]>([]);
  const [propagateSelected, setPropagateSelected] = useState<Set<string>>(new Set());
  const [propagateEditing, setPropagateEditing] = useState<Record<string, string>>({});
  const [propagating, setPropagating] = useState(false);

  // Parse ===TAG=== delimited revision from AI response
  const parseRevision = (text: string): { fields: { problem: string; solved: string; deployed: string; takeaway: string } | null; commentary: string } => {
    const sections: Record<string, string> = {};
    const tagNames = ["PROBLEM", "SOLVED", "DEPLOYED", "TAKEAWAY"];
    let remaining = text;

    for (const tag of tagNames) {
      const startTag = `===${tag}===`;
      const endTag = `===END_${tag}===`;
      const startIdx = remaining.indexOf(startTag);
      const endIdx = remaining.indexOf(endTag);
      if (startIdx !== -1 && endIdx !== -1) {
        sections[tag.toLowerCase()] = remaining.slice(startIdx + startTag.length, endIdx).trim();
        remaining = remaining.slice(0, startIdx) + remaining.slice(endIdx + endTag.length);
      }
    }

    if (sections.problem && sections.solved && sections.deployed) {
      return {
        fields: {
          problem: sections.problem,
          solved: sections.solved,
          deployed: sections.deployed,
          takeaway: sections.takeaway || "",
        },
        commentary: remaining.trim(),
      };
    }
    return { fields: null, commentary: text };
  };

  // Send AI message
  const sendAiMessage = async (action: "interview" | "chat" | "revise", message?: string) => {
    if (!aiModalStory) return;
    setAiLoading(true);

    const newHistory = message
      ? [...aiHistory, { role: "user" as const, content: message }]
      : aiHistory;

    if (message) {
      setAiHistory(newHistory);
      setAiMessage("");
    }

    try {
      const resp = await apiPost<StoryAIResponse>(
        `/stories/${aiModalStory.id}/ai-assist`,
        {
          action,
          message: message || null,
          history: newHistory,
        }
      );

      const { fields, commentary } = parseRevision(resp.suggestion);

      if (fields) {
        setRevisedStory(fields);
        setAiPhase("compare");
        if (commentary) {
          setAiHistory((h) => [...h, { role: "ai", content: commentary }]);
        }
      } else {
        setAiHistory((h) => [...h, { role: "ai", content: resp.suggestion }]);
        if (action === "interview" && aiHistory.length >= 6) {
          setAiPhase("chat");
        }
      }
    } catch {
      setAiHistory((h) => [
        ...h,
        { role: "ai", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Open Ask AI modal
  const openAiModal = async (story: StoryBankStory) => {
    setLoadingDetail(true);
    try {
      const fullStory = await apiGet<StoryBankStoryDetail>(`/stories/${story.id}`);
      setAiModalStory(fullStory);
      setAiHistory([]);
      setAiMessage("");
      setAiPhase("interview");
      setRevisedStory(null);
      setEditingRevised(false);
      // Auto-start interview
      setAiLoading(true);
      try {
        const resp = await apiPost<StoryAIResponse>(
          `/stories/${fullStory.id}/ai-assist`,
          { action: "interview", message: null, history: [] }
        );
        setAiHistory([{ role: "ai", content: resp.suggestion }]);
      } catch {
        setAiHistory([{ role: "ai", content: "Let me take a look at this story... How about we start — what part of this story feels least accurate to you?" }]);
      } finally {
        setAiLoading(false);
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  // Close Ask AI modal
  const closeAiModal = () => {
    setAiModalStory(null);
    setAiHistory([]);
    setAiPhase("interview");
    setRevisedStory(null);
    setEditingRevised(false);
    setPropagateTargets([]);
    setPropagateSelected(new Set());
    setPropagateEditing({});
  };

  // Save revised story
  const saveRevisedStory = async () => {
    if (!aiModalStory || !revisedStory) return;
    setSaving(true);
    try {
      await apiPut(`/stories/${aiModalStory.id}`, {
        problem: revisedStory.problem,
        solved: revisedStory.solved,
        deployed: revisedStory.deployed,
        takeaway: revisedStory.takeaway || null,
        change_summary: "AI-assisted revision via Story Interview",
      });
      await loadStories();
      await loadSummary();

      // Check for propagation targets (feedback loop)
      try {
        const preview = await apiPost<PropagatePreviewResponse>(
          `/stories/${aiModalStory.id}/propagate/preview`
        );
        if (preview.targets.length > 0) {
          setPropagateTargets(preview.targets);
          setPropagateSelected(new Set(preview.targets.map((t) => t.target_type)));
          setPropagateEditing({});
          setAiPhase("propagate");
          return; // Don't close — show propagate step
        }
      } catch {
        // Propagation preview failed — just close gracefully
      }

      closeAiModal();
    } finally {
      setSaving(false);
    }
  };

  // Apply propagation changes
  const applyPropagation = async () => {
    if (!aiModalStory || propagateTargets.length === 0) return;
    setPropagating(true);
    try {
      const updates = propagateTargets
        .filter((t) => propagateSelected.has(t.target_type))
        .map((t) => ({
          target_type: t.target_type,
          entity_id: t.entity_id,
          new_text: propagateEditing[t.target_type] ?? t.suggested_text,
        }));

      if (updates.length > 0) {
        await apiPost<PropagateApplyResponse>(
          `/stories/${aiModalStory.id}/propagate/apply`,
          { updates }
        );
      }
      closeAiModal();
    } finally {
      setPropagating(false);
    }
  };

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiHistory, aiLoading]);

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

      {/* Ask AI Modal */}
      {aiModalStory && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Modal header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-3">
              <button onClick={closeAiModal} className="rounded-md p-1 hover:bg-accent">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Sparkles className="h-5 w-5 text-purple-500" />
              <div>
                <h2 className="font-semibold">Story Interview</h2>
                <p className="text-xs text-muted-foreground">{aiModalStory.story_title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {aiPhase !== "compare" && aiPhase !== "propagate" && (
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                  {aiPhase === "interview" ? "Guided Interview" : "Free-form Chat"}
                </span>
              )}
              {aiPhase === "propagate" && (
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  Update Related Records
                </span>
              )}
              <button onClick={closeAiModal} className="rounded-md p-1 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Modal body */}
          {aiPhase === "propagate" ? (
            /* -------- PROPAGATE PHASE -------- */
            <div className="flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl p-6 space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold">Update Related Records</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your story corrections can improve your resume variant and profile too.
                    Review the suggestions below and choose what to apply.
                  </p>
                </div>

                {propagateTargets.map((target) => (
                  <div
                    key={target.target_type}
                    className={`rounded-lg border p-4 space-y-3 ${
                      propagateSelected.has(target.target_type)
                        ? "border-purple-300 dark:border-purple-700 bg-purple-50/30 dark:bg-purple-900/10"
                        : "border-border opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={propagateSelected.has(target.target_type)}
                          onChange={(e) => {
                            const next = new Set(propagateSelected);
                            if (e.target.checked) next.add(target.target_type);
                            else next.delete(target.target_type);
                            setPropagateSelected(next);
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="font-medium text-sm">
                          {target.target_type === "variant" ? "Resume Variant" : "Profile Experience"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          — {target.entity_label}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (propagateEditing[target.target_type] !== undefined) {
                            const next = { ...propagateEditing };
                            delete next[target.target_type];
                            setPropagateEditing(next);
                          } else {
                            setPropagateEditing({
                              ...propagateEditing,
                              [target.target_type]: target.suggested_text,
                            });
                          }
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {propagateEditing[target.target_type] !== undefined ? "Done Editing" : "Edit"}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Current</p>
                        <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-2">
                          {target.original_text.length > 300
                            ? target.original_text.slice(0, 300) + "..."
                            : target.original_text}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">Suggested</p>
                        {propagateEditing[target.target_type] !== undefined ? (
                          <textarea
                            value={propagateEditing[target.target_type]}
                            onChange={(e) =>
                              setPropagateEditing({
                                ...propagateEditing,
                                [target.target_type]: e.target.value,
                              })
                            }
                            rows={5}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap bg-purple-50/50 dark:bg-purple-900/20 rounded p-2">
                            {target.suggested_text.length > 300
                              ? target.suggested_text.slice(0, 300) + "..."
                              : target.suggested_text}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={closeAiModal}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
                  >
                    Skip
                  </button>
                  <button
                    onClick={applyPropagation}
                    disabled={propagating || propagateSelected.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {propagating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Apply {propagateSelected.size} Update{propagateSelected.size !== 1 ? "s" : ""}
                  </button>
                </div>
              </div>
            </div>
          ) : aiPhase === "compare" && revisedStory ? (
            /* -------- COMPARE PHASE -------- */
            <div className="flex-1 overflow-auto">
              <div className="mx-auto max-w-6xl p-6">
                <div className="mb-4 text-center">
                  <h3 className="text-lg font-semibold">Compare & Choose</h3>
                  <p className="text-sm text-muted-foreground">Review the AI revision against your original story</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Original */}
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <h4 className="text-center font-semibold text-muted-foreground">Original</h4>
                    <div>
                      <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">THE PROBLEM</p>
                      <p className="text-sm whitespace-pre-wrap">{aiModalStory.problem}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">HOW I SOLVED IT</p>
                      <p className="text-sm whitespace-pre-wrap">{aiModalStory.solved}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">WHAT I DEPLOYED</p>
                      <p className="text-sm whitespace-pre-wrap">{aiModalStory.deployed}</p>
                    </div>
                    {aiModalStory.takeaway && (
                      <div>
                        <p className="text-xs font-semibold mb-1">KEY TAKEAWAY</p>
                        <p className="text-sm italic">{aiModalStory.takeaway}</p>
                      </div>
                    )}
                  </div>

                  {/* Revised */}
                  <div className="rounded-lg border-2 border-purple-300 dark:border-purple-700 bg-purple-50/30 dark:bg-purple-900/10 p-4 space-y-3">
                    <h4 className="text-center font-semibold text-purple-600 dark:text-purple-400">AI Revised</h4>
                    {editingRevised ? (
                      <>
                        <div>
                          <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">THE PROBLEM</p>
                          <textarea
                            value={revisedStory.problem}
                            onChange={(e) => setRevisedStory({ ...revisedStory, problem: e.target.value })}
                            rows={4}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">HOW I SOLVED IT</p>
                          <textarea
                            value={revisedStory.solved}
                            onChange={(e) => setRevisedStory({ ...revisedStory, solved: e.target.value })}
                            rows={5}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">WHAT I DEPLOYED</p>
                          <textarea
                            value={revisedStory.deployed}
                            onChange={(e) => setRevisedStory({ ...revisedStory, deployed: e.target.value })}
                            rows={4}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-semibold mb-1">KEY TAKEAWAY</p>
                          <input
                            value={revisedStory.takeaway}
                            onChange={(e) => setRevisedStory({ ...revisedStory, takeaway: e.target.value })}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">THE PROBLEM</p>
                          <p className="text-sm whitespace-pre-wrap">{revisedStory.problem}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">HOW I SOLVED IT</p>
                          <p className="text-sm whitespace-pre-wrap">{revisedStory.solved}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">WHAT I DEPLOYED</p>
                          <p className="text-sm whitespace-pre-wrap">{revisedStory.deployed}</p>
                        </div>
                        {revisedStory.takeaway && (
                          <div>
                            <p className="text-xs font-semibold mb-1">KEY TAKEAWAY</p>
                            <p className="text-sm italic">{revisedStory.takeaway}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Compare actions */}
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    onClick={closeAiModal}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
                  >
                    Keep Original
                  </button>
                  <button
                    onClick={() => { setAiPhase("chat"); setRevisedStory(null); setEditingRevised(false); }}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
                  >
                    Back to Chat
                  </button>
                  {!editingRevised ? (
                    <button
                      onClick={() => setEditingRevised(true)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-purple-300 dark:border-purple-700 px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Revised
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingRevised(false)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
                    >
                      <Check className="h-3.5 w-3.5" /> Done Editing
                    </button>
                  )}
                  <button
                    onClick={saveRevisedStory}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Use Revised
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* -------- INTERVIEW / CHAT PHASE -------- */
            <div className="flex flex-1 overflow-hidden">
              {/* Left: Current story reference */}
              <div className="hidden lg:block w-[380px] shrink-0 border-r border-border overflow-y-auto p-5">
                <h3 className="font-semibold text-sm text-muted-foreground mb-3">Current Story</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">THE PROBLEM (The Hook)</p>
                    <p className="text-sm whitespace-pre-wrap">{aiModalStory.problem}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">HOW I SOLVED IT</p>
                    <p className="text-sm whitespace-pre-wrap">{aiModalStory.solved}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">WHAT I DEPLOYED</p>
                    <p className="text-sm whitespace-pre-wrap">{aiModalStory.deployed}</p>
                  </div>
                  {aiModalStory.takeaway && (
                    <div>
                      <p className="text-xs font-semibold mb-1">Key Takeaway</p>
                      <p className="text-sm italic">{aiModalStory.takeaway}</p>
                    </div>
                  )}
                  {aiModalStory.hook_line && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Quick Hook</p>
                      <p className="text-sm">{aiModalStory.hook_line}</p>
                    </div>
                  )}
                  {(aiModalStory.source_title || aiModalStory.source_company) && (
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">
                        {aiModalStory.source_title}{aiModalStory.source_title && aiModalStory.source_company ? " at " : ""}{aiModalStory.source_company}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Chat panel */}
              <div className="flex flex-1 flex-col">
                {/* Chat messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {aiHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {msg.role === "ai" ? (
                          <MarkdownContent content={msg.content} />
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-lg bg-muted px-4 py-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick actions + input */}
                <div className="border-t border-border p-4">
                  {aiHistory.length > 0 && aiPhase !== "compare" && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => sendAiMessage("revise")}
                        disabled={aiLoading}
                        className="inline-flex items-center gap-1 rounded-full border border-purple-300 dark:border-purple-700 px-3 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" /> Generate Revised Story
                      </button>
                    </div>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!aiMessage.trim() || aiLoading) return;
                      const action = aiPhase === "interview" ? "interview" : "chat";
                      sendAiMessage(action, aiMessage.trim());
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={aiMessage}
                      onChange={(e) => setAiMessage(e.target.value)}
                      placeholder={
                        aiPhase === "interview"
                          ? "Answer the question..."
                          : "Chat about your story..."
                      }
                      disabled={aiLoading}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={aiLoading || !aiMessage.trim()}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
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
                          <button
                            onClick={(e) => { e.stopPropagation(); openAiModal(story); }}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                          >
                            <Sparkles className="h-3.5 w-3.5" /> Ask AI
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
