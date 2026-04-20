"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { useBreadcrumbs } from "@/components/breadcrumbs";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import type {
  InterviewQuestion,
  InterviewQuestionCreate,
  InterviewQuestionSummary,
  StoryBankStory,
  FileImportResult,
  TranscribeResult,
} from "@/lib/types";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Save,
  MessageCircleQuestion,
  Tag,
  ArrowLeft,
  Upload,
  Mic,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

const STAGES = [
  "phone_screen",
  "recruiter",
  "technical",
  "behavioral",
  "panel",
  "virtual",
  "onsite",
  "final",
  "other",
];

const FORMATS = ["virtual", "onsite", "phone", "async", "other"];

const OUTCOMES = ["pending", "advanced", "passed", "rejected", "withdrawn"];

type FormState = {
  question_text: string;
  company: string;
  role_title: string;
  interview_stage: string;
  interview_format: string;
  date_asked: string;
  topic_tags: string;
  notes: string;
  model_answer: string;
  outcome: string;
  linked_story_ids: string[];
};

const emptyForm = (): FormState => ({
  question_text: "",
  company: "",
  role_title: "",
  interview_stage: "",
  interview_format: "",
  date_asked: "",
  topic_tags: "",
  notes: "",
  model_answer: "",
  outcome: "",
  linked_story_ids: [],
});

function toPayload(f: FormState): InterviewQuestionCreate {
  const tags = f.topic_tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    question_text: f.question_text.trim(),
    company: f.company.trim() || null,
    role_title: f.role_title.trim() || null,
    interview_stage: f.interview_stage || null,
    interview_format: f.interview_format || null,
    date_asked: f.date_asked || null,
    topic_tags: tags.length ? tags : null,
    notes: f.notes.trim() || null,
    model_answer: f.model_answer.trim() || null,
    outcome: f.outcome || null,
    linked_story_ids: f.linked_story_ids.length ? f.linked_story_ids : null,
  };
}

export default function InterviewQuestionsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("interview_questions", "create");
  const canEdit = hasPermission("interview_questions", "edit");
  const canDelete = hasPermission("interview_questions", "delete");
  const breadcrumbs = useBreadcrumbs();

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [summary, setSummary] = useState<InterviewQuestionSummary | null>(null);
  const [stories, setStories] = useState<StoryBankStory[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedQuestion, setSelectedQuestion] = useState<InterviewQuestion | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const [showImport, setShowImport] = useState(false);
  const [showTranscribe, setShowTranscribe] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qs, s, st] = await Promise.all([
        apiGet<InterviewQuestion[]>("/interview-questions"),
        apiGet<InterviewQuestionSummary>("/interview-questions/summary"),
        apiGet<StoryBankStory[]>("/stories?status=active").catch(() => []),
      ]);
      setQuestions(qs);
      setSummary(s);
      setStories(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Navigation
  const backToList = useCallback(() => {
    setSelectedQuestion(null);
    setEditingId(null);
  }, []);

  useEffect(() => {
    if (selectedQuestion) {
      const preview =
        selectedQuestion.company
          ? `${selectedQuestion.company} — ${selectedQuestion.question_text.slice(0, 40)}…`
          : selectedQuestion.question_text.slice(0, 50) + "…";
      breadcrumbs.set([
        { label: "Interview Questions", onClick: backToList },
        { label: preview },
      ]);
    } else {
      breadcrumbs.set([{ label: "Interview Questions" }]);
    }
  }, [selectedQuestion, breadcrumbs, backToList]);

  useEffect(() => {
    return () => breadcrumbs.clear();
  }, [breadcrumbs]);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === "/interview-questions") backToList();
    };
    window.addEventListener("sidebar-nav-reset", handler);
    return () => window.removeEventListener("sidebar-nav-reset", handler);
  }, [backToList]);

  // CRUD handlers
  const startCreate = () => {
    setForm(emptyForm());
    setShowCreate(true);
    setEditingId(null);
  };

  const startEdit = (q: InterviewQuestion) => {
    setForm({
      question_text: q.question_text,
      company: q.company || "",
      role_title: q.role_title || "",
      interview_stage: q.interview_stage || "",
      interview_format: q.interview_format || "",
      date_asked: q.date_asked || "",
      topic_tags: (q.topic_tags || []).join(", "),
      notes: q.notes || "",
      model_answer: q.model_answer || "",
      outcome: q.outcome || "",
      linked_story_ids: q.linked_story_ids || [],
    });
    setEditingId(q.id);
    setShowCreate(true);
  };

  const closeForm = () => {
    setShowCreate(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.question_text.trim()) {
      alert("Question text is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editingId) {
        await apiPatch(`/interview-questions/${editingId}`, payload);
      } else {
        await apiPost("/interview-questions", payload);
      }
      await load();
      closeForm();
      if (selectedQuestion && editingId) {
        const updated = await apiGet<InterviewQuestion>(`/interview-questions/${editingId}`);
        setSelectedQuestion(updated);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (q: InterviewQuestion) => {
    if (!confirm(`Delete this question from ${q.company || "(no company)"}?`)) return;
    setDeletingIds((prev) => new Set(prev).add(q.id));
    try {
      await apiDelete(`/interview-questions/${q.id}`);
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
      if (selectedQuestion?.id === q.id) backToList();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(q.id);
        return next;
      });
    }
  };

  const toggleStoryLink = (storyId: string) => {
    setForm((f) => ({
      ...f,
      linked_story_ids: f.linked_story_ids.includes(storyId)
        ? f.linked_story_ids.filter((id) => id !== storyId)
        : [...f.linked_story_ids, storyId],
    }));
  };

  const storyById = useMemo(() => {
    const m = new Map<string, StoryBankStory>();
    stories.forEach((s) => m.set(s.id, s));
    return m;
  }, [stories]);

  const selectQuestion = useCallback((q: InterviewQuestion) => {
    setSelectedQuestion(q);
    setEditingId(null);
  }, []);

  // DataTable columns
  const columns = useMemo<ColumnDef<InterviewQuestion, unknown>[]>(
    () => [
      {
        accessorKey: "date_asked",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => {
          const val = row.getValue("date_asked") as string | null;
          return val ? formatDate(val) : "—";
        },
        enableColumnFilter: false,
      },
      {
        accessorKey: "company",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Company" />,
        cell: ({ row }) => (
          <span className="font-medium">{(row.getValue("company") as string) || "—"}</span>
        ),
        filterFn: "arrIncludes" as const,
      },
      {
        accessorKey: "role_title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
        cell: ({ row }) => (row.getValue("role_title") as string) || "—",
        enableColumnFilter: false,
      },
      {
        accessorKey: "question_text",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Question" />,
        cell: ({ row }) => (
          <div className="line-clamp-2 max-w-md">{row.getValue("question_text") as string}</div>
        ),
        enableColumnFilter: false,
      },
      {
        accessorKey: "interview_stage",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Stage" />,
        cell: ({ row }) => (row.getValue("interview_stage") as string) || "—",
        filterFn: "arrIncludes" as const,
      },
      {
        accessorKey: "outcome",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Outcome" />,
        cell: ({ row }) => {
          const outcome = row.getValue("outcome") as string | null;
          if (!outcome) return "—";
          const colors: Record<string, string> = {
            advanced: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
            passed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
            pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
            rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
            withdrawn: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
          };
          return (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[outcome] || ""}`}>
              {outcome}
            </span>
          );
        },
        filterFn: "arrIncludes" as const,
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const st = row.getValue("status") as string;
          return (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                st === "active"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
              }`}
            >
              {st}
            </span>
          );
        },
        filterFn: "arrIncludes" as const,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {canEdit && (
              <button
                onClick={() => startEdit(row.original)}
                className="rounded-md p-1 hover:bg-accent"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDelete(row.original)}
                disabled={deletingIds.has(row.original.id)}
                className="rounded-md p-1 hover:bg-red-50 disabled:opacity-50"
                style={{ color: "rgb(220,38,38)" }}
                title="Delete"
              >
                {deletingIds.has(row.original.id) ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canDelete, deletingIds],
  );

  const filterableColumns = useMemo(
    () => [
      {
        id: "company",
        title: "Company",
        options: [...new Set(questions.map((q) => q.company).filter(Boolean))]
          .sort()
          .map((c) => ({ label: c!, value: c! })),
      },
      {
        id: "interview_stage",
        title: "Stage",
        options: STAGES.map((s) => ({ label: s, value: s })),
      },
      {
        id: "outcome",
        title: "Outcome",
        options: OUTCOMES.map((o) => ({ label: o, value: o })),
      },
      {
        id: "status",
        title: "Status",
        options: [
          { label: "Active", value: "active" },
          { label: "Archived", value: "archived" },
        ],
      },
    ],
    [questions],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageCircleQuestion className="h-6 w-6" />
            Interview Questions
          </h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Real questions you&apos;ve been asked. Tag them, link to Story Bank
            answers, and build a retrieval-ready bank for future interview prep.
          </p>
        </div>
        {!selectedQuestion && canCreate && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTranscribe(true)}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              style={{ borderColor: "var(--border)" }}
            >
              <Mic className="h-4 w-4" />
              Transcribe Recording
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              style={{ borderColor: "var(--border)" }}
            >
              <Upload className="h-4 w-4" />
              Import File
            </button>
            <button
              onClick={startCreate}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus className="h-4 w-4" />
              Add Question
            </button>
          </div>
        )}
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total" value={summary.total_count} />
          <StatCard label="Active" value={summary.active_count} />
          <StatCard label="Companies" value={summary.unique_companies} />
          <StatCard
            label="Most Recent"
            value={summary.most_recent_date ? formatDate(summary.most_recent_date) : "—"}
          />
        </div>
      )}

      {/* Detail view or DataTable */}
      {selectedQuestion ? (
        <div className="space-y-4">
          <button
            onClick={backToList}
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Questions
          </button>

          <div
            className="rounded-lg border p-6"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
          >
            <QuestionDetail q={selectedQuestion} storyById={storyById} />

            <div
              className="mt-6 flex items-center gap-2 border-t pt-4"
              style={{ borderColor: "var(--border)" }}
            >
              {canEdit && (
                <button
                  onClick={() => startEdit(selectedQuestion)}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => handleDelete(selectedQuestion)}
                  disabled={deletingIds.has(selectedQuestion.id)}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-red-50 disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "rgb(220,38,38)" }}
                >
                  {deletingIds.has(selectedQuestion.id) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ) : questions.length > 0 ? (
        <DataTable
          columns={columns}
          data={questions}
          searchKey="question_text"
          searchPlaceholder="Search questions..."
          filterableColumns={filterableColumns}
          storageKey="interview-questions-table"
          onRowClick={selectQuestion}
        />
      ) : (
        <div
          className="rounded-lg border p-12 text-center"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
        >
          <MessageCircleQuestion className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm">No questions yet. Click &ldquo;Add Question&rdquo; to capture one.</p>
        </div>
      )}

      {/* Form drawer */}
      {showCreate && (
        <QuestionFormDrawer
          form={form}
          setForm={setForm}
          onClose={closeForm}
          onSave={handleSave}
          saving={saving}
          editing={!!editingId}
          stories={stories}
          toggleStoryLink={toggleStoryLink}
        />
      )}

      {/* Import file modal */}
      {showImport && (
        <ImportFileModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            load();
            setShowImport(false);
          }}
        />
      )}

      {/* Transcribe recording modal */}
      {showTranscribe && (
        <TranscribeModal
          onClose={() => setShowTranscribe(false)}
          onSuccess={() => {
            load();
            setShowTranscribe(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helper components                                                   */
/* ------------------------------------------------------------------ */

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
    >
      <div className="text-xs uppercase" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function QuestionDetail({
  q,
  storyById,
}: {
  q: InterviewQuestion;
  storyById: Map<string, StoryBankStory>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
          Question
        </div>
        <div className="mt-1 whitespace-pre-wrap text-base">{q.question_text}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <Field label="Stage" value={q.interview_stage} />
        <Field label="Format" value={q.interview_format} />
        <Field label="Outcome" value={q.outcome} />
        <Field label="Status" value={q.status} />
      </div>

      {q.topic_tags && q.topic_tags.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
            Topics
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {q.topic_tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs"
                style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
              >
                <Tag className="h-2.5 w-2.5" />
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {q.notes && (
        <div>
          <div className="text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
            Your Notes
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm">{q.notes}</div>
        </div>
      )}

      {q.model_answer && (
        <div>
          <div className="text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
            Reference Answer
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm">{q.model_answer}</div>
        </div>
      )}

      {q.linked_story_ids && q.linked_story_ids.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
            Linked Stories
          </div>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {q.linked_story_ids.map((sid) => {
              const s = storyById.get(sid);
              return <li key={sid}>{s ? s.story_title : `(story ${sid.slice(0, 8)}…)`}</li>;
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form drawer                                                         */
/* ------------------------------------------------------------------ */

function QuestionFormDrawer({
  form,
  setForm,
  onClose,
  onSave,
  saving,
  editing,
  stories,
  toggleStoryLink,
}: {
  form: FormState;
  setForm: (f: FormState | ((prev: FormState) => FormState)) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  editing: boolean;
  stories: StoryBankStory[];
  toggleStoryLink: (storyId: string) => void;
}) {
  const update =
    <K extends keyof FormState>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl overflow-y-auto p-6"
        style={{ backgroundColor: "var(--background)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editing ? "Edit Question" : "Add Question"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Labeled label="Question *">
            <textarea
              value={form.question_text}
              onChange={update("question_text")}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
            />
          </Labeled>

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Company">
              <input
                value={form.company}
                onChange={update("company")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
              />
            </Labeled>
            <Labeled label="Role">
              <input
                value={form.role_title}
                onChange={update("role_title")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
              />
            </Labeled>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Labeled label="Date">
              <input
                type="date"
                value={form.date_asked}
                onChange={update("date_asked")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
              />
            </Labeled>
            <Labeled label="Stage">
              <select
                value={form.interview_stage}
                onChange={update("interview_stage")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
              >
                <option value="">--</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Format">
              <select
                value={form.interview_format}
                onChange={update("interview_format")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
              >
                <option value="">--</option>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Labeled>
          </div>

          <Labeled label="Topics (comma-separated)">
            <input
              value={form.topic_tags}
              onChange={update("topic_tags")}
              placeholder="ai-security, risk-assessment, behavioral"
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
            />
          </Labeled>

          <Labeled label="Your Notes (how you answered / what you'd change)">
            <textarea
              value={form.notes}
              onChange={update("notes")}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
            />
          </Labeled>

          <Labeled label="Reference Answer (a 'gold' answer to study from)">
            <textarea
              value={form.model_answer}
              onChange={update("model_answer")}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
            />
          </Labeled>

          <Labeled label="Outcome">
            <select
              value={form.outcome}
              onChange={update("outcome")}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
            >
              <option value="">--</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Labeled>

          {stories.length > 0 && (
            <Labeled label="Link Story Bank entries (optional)">
              <div
                className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                {stories.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={form.linked_story_ids.includes(s.id)}
                      onChange={() => toggleStoryLink(s.id)}
                    />
                    <span className="truncate">{s.story_title}</span>
                  </label>
                ))}
              </div>
            </Labeled>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Import file modal                                                   */
/* ------------------------------------------------------------------ */

function ImportFileModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<FileImportResult | null>(null);
  const [error, setError] = useState("");

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const res = await apiUpload<FileImportResult>("/interview-questions/import-file", file);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border p-6"
        style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import Questions from File</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Imported {result.imported_count} question(s)</span>
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <p className="font-medium text-amber-800 dark:text-amber-400">Warnings:</p>
                <ul className="mt-1 list-disc pl-5 text-amber-700 dark:text-amber-300">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={onSuccess}
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Upload a CSV, JSON, or TXT file with interview questions. CSV files should have a
              &ldquo;question_text&rdquo; column. JSON should be an array of question objects.
              TXT files split questions by blank lines.
            </p>

            <input
              type="file"
              accept=".csv,.json,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file || importing}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload &amp; Import
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transcribe recording modal                                          */
/* ------------------------------------------------------------------ */

function TranscribeModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "review" | "saving">("upload");
  const [transcribing, setTranscribing] = useState(false);
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [editableQuestions, setEditableQuestions] = useState<InterviewQuestionCreate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleTranscribe = async () => {
    if (!file) return;
    setTranscribing(true);
    setError("");
    try {
      const res = await apiUpload<TranscribeResult>("/interview-questions/transcribe", file);
      setResult(res);
      setEditableQuestions(
        res.parsed_questions.map((pq) => ({
          question_text: pq.question_text || "",
          company: pq.company || null,
          role_title: pq.role_title || null,
          interview_stage: pq.interview_stage || null,
          interview_format: pq.interview_format || null,
          date_asked: pq.date_asked || null,
          topic_tags: pq.topic_tags || null,
          notes: pq.notes || null,
          model_answer: pq.model_answer || null,
          outcome: pq.outcome || null,
        })),
      );
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  const removeQuestion = (idx: number) => {
    setEditableQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: string, value: string) => {
    setEditableQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value || null } : q)),
    );
  };

  const handleSaveAll = async () => {
    const valid = editableQuestions.filter((q) => q.question_text?.trim());
    if (valid.length === 0) {
      setError("No questions to save");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiPost("/interview-questions/bulk-create", { questions: valid });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto py-8"
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border p-6"
        style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {step === "upload" ? "Transcribe Interview Recording" : "Review Extracted Questions"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Upload an audio or video recording of an interview. The recording will be
              transcribed and AI will extract the interview questions asked.
            </p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Supported formats: MOV, MP4, M4A, WAV, MP3, WEBM (max 50 MB)
            </p>

            <input
              type="file"
              accept=".mov,.mp4,.m4a,.wav,.mp3,.webm"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleTranscribe}
                disabled={!file || transcribing}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {transcribing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Transcribing…
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Transcribe
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === "review" && result && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
                Transcript
              </div>
              <textarea
                readOnly
                value={result.transcript}
                rows={6}
                className="w-full rounded-md border px-3 py-2 text-xs"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
              />
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase" style={{ color: "var(--muted-foreground)" }}>
                Extracted Questions ({editableQuestions.length})
              </div>

              {editableQuestions.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  No questions were extracted. You can close this and add questions manually.
                </p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto">
                  {editableQuestions.map((q, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border p-3"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <textarea
                          value={q.question_text || ""}
                          onChange={(e) => updateQuestion(idx, "question_text", e.target.value)}
                          rows={2}
                          className="flex-1 rounded-md border px-2 py-1 text-sm"
                          style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                        />
                        <button
                          onClick={() => removeQuestion(idx)}
                          className="shrink-0 rounded-md p-1 hover:bg-red-50"
                          style={{ color: "rgb(220,38,38)" }}
                          title="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={q.company || ""}
                          onChange={(e) => updateQuestion(idx, "company", e.target.value)}
                          placeholder="Company"
                          className="rounded-md border px-2 py-1 text-xs"
                          style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                        />
                        <input
                          value={q.interview_stage || ""}
                          onChange={(e) => updateQuestion(idx, "interview_stage", e.target.value)}
                          placeholder="Stage"
                          className="rounded-md border px-2 py-1 text-xs"
                          style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                        />
                        <input
                          value={Array.isArray(q.topic_tags) ? q.topic_tags.join(", ") : ""}
                          onChange={(e) => updateQuestion(idx, "topic_tags", e.target.value)}
                          placeholder="Topics (comma-separated)"
                          className="rounded-md border px-2 py-1 text-xs"
                          style={{ borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border px-4 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving || editableQuestions.length === 0}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save {editableQuestions.length} Question(s)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Labeled helper                                                      */
/* ------------------------------------------------------------------ */

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
