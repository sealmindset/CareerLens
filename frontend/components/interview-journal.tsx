"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Edit3,
  Calendar,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Target,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { InterviewJournalEntry, Event } from "@/lib/types";

const ENTRY_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare },
  { value: "outcome", label: "Outcome", icon: Target },
  { value: "feedback", label: "Feedback", icon: ThumbsUp },
  { value: "debrief", label: "Debrief", icon: FileText },
] as const;

const OUTCOMES = [
  { value: "passed", label: "Passed", color: "text-green-600" },
  { value: "failed", label: "Failed", color: "text-red-600" },
  { value: "pending", label: "Pending", color: "text-yellow-600" },
  { value: "moved_forward", label: "Moved Forward", color: "text-blue-600" },
] as const;

interface Props {
  applicationId: string;
  currentStage: string;
  events?: Event[];
}

export function InterviewJournal({
  applicationId,
  currentStage,
  events = [],
}: Props) {
  const [entries, setEntries] = useState<InterviewJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Form state
  const [formType, setFormType] = useState("note");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formOutcome, setFormOutcome] = useState("");
  const [formEventId, setFormEventId] = useState("");
  const [formStage, setFormStage] = useState(currentStage);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<InterviewJournalEntry[]>(
        `/interview-journal/by-application/${applicationId}`,
      );
      setEntries(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setFormStage(currentStage);
  }, [currentStage]);

  const resetForm = () => {
    setFormType("note");
    setFormTitle("");
    setFormContent("");
    setFormOutcome("");
    setFormEventId("");
    setFormStage(currentStage);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        application_id: applicationId,
        entry_type: formType,
        title: formTitle || null,
        content: formContent || null,
        outcome: formOutcome || null,
        event_id: formEventId || null,
        pipeline_stage: formStage || null,
      };

      if (editingId) {
        await apiPut(`/interview-journal/${editingId}`, body);
      } else {
        await apiPost("/interview-journal", body);
      }
      resetForm();
      await load();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry: InterviewJournalEntry) => {
    setEditingId(entry.id);
    setFormType(entry.entry_type);
    setFormTitle(entry.title || "");
    setFormContent(entry.content || "");
    setFormOutcome(entry.outcome || "");
    setFormEventId(entry.event_id || "");
    setFormStage(entry.pipeline_stage || currentStage);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/interview-journal/${id}`);
      await load();
    } catch {
      // ignore
    }
  };

  const entryTypeIcon = (type: string) => {
    const def = ENTRY_TYPES.find((t) => t.value === type);
    if (!def) return MessageSquare;
    return def.icon;
  };

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Interview Journal</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {entries.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4">
          <div className="flex justify-end py-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" /> Add Entry
            </button>
          </div>

          {/* Inline form */}
          {showForm && (
            <div className="mb-4 rounded-md border bg-muted/20 p-3 space-y-3">
              <div className="flex gap-2">
                {ENTRY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setFormType(t.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      formType === t.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted text-muted-foreground hover:border-foreground",
                    )}
                  >
                    <t.icon className="h-3 w-3" />
                    {t.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Title (optional)"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />

              <textarea
                placeholder="What happened? Key takeaways, feedback received..."
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />

              <div className="flex gap-3 flex-wrap">
                <select
                  value={formOutcome}
                  onChange={(e) => setFormOutcome(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Outcome...</option>
                  {OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {events.length > 0 && (
                  <select
                    value={formEventId}
                    onChange={(e) => setFormEventId(e.target.value)}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Link event...</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Loading...
            </p>
          ) : entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No journal entries yet. Track your interview progress here.
            </p>
          ) : (
            <div className="relative space-y-0">
              <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
              {entries.map((entry) => {
                const Icon = entryTypeIcon(entry.entry_type);
                const outcomeDef = OUTCOMES.find(
                  (o) => o.value === entry.outcome,
                );
                return (
                  <div
                    key={entry.id}
                    className="relative flex gap-3 py-2.5 pl-0"
                  >
                    <div className="relative z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border bg-card">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.title && (
                          <span className="font-medium text-sm">
                            {entry.title}
                          </span>
                        )}
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {entry.entry_type}
                        </span>
                        {entry.pipeline_stage && (
                          <span className="rounded-full bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
                            {entry.pipeline_stage.replace(/_/g, " ")}
                          </span>
                        )}
                        {outcomeDef && (
                          <span className={cn("text-xs font-medium", outcomeDef.color)}>
                            {outcomeDef.label}
                          </span>
                        )}
                      </div>
                      {entry.content && (
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-3">
                          {entry.content}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground">
                          <Calendar className="mr-0.5 inline-block h-3 w-3" />
                          {new Date(entry.entry_date).toLocaleDateString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleEdit(entry)}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          <Edit3 className="inline-block h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          className="text-[10px] text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="inline-block h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
