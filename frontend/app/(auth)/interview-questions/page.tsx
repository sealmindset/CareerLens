"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type {
  InterviewQuestion,
  InterviewQuestionCreate,
  InterviewQuestionSummary,
  StoryBankStory,
} from "@/lib/types";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Save,
  MessageCircleQuestion,
  ChevronDown,
  ChevronUp,
  Tag,
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

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [summary, setSummary] = useState<InterviewQuestionSummary | null>(null);
  const [stories, setStories] = useState<StoryBankStory[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const [filterCompany, setFilterCompany] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

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

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (
        filterCompany &&
        !(q.company || "").toLowerCase().includes(filterCompany.toLowerCase())
      ) {
        return false;
      }
      if (filterTopic) {
        const t = filterTopic.toLowerCase();
        if (!q.topic_tags?.some((tag) => tag.toLowerCase().includes(t))) {
          return false;
        }
      }
      return true;
    });
  }, [questions, filterCompany, filterTopic]);

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
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (q: InterviewQuestion) => {
    if (!confirm(`Delete this question from ${q.company || "(no company)"}?`)) {
      return;
    }
    setDeletingIds((prev) => new Set(prev).add(q.id));
    try {
      await apiDelete(`/interview-questions/${q.id}`);
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
      if (expandedId === q.id) setExpandedId(null);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: "var(--primary)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        {canCreate && (
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
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total" value={summary.total_count} />
          <StatCard label="Active" value={summary.active_count} />
          <StatCard label="Companies" value={summary.unique_companies} />
          <StatCard
            label="Most Recent"
            value={summary.most_recent_date ? formatDate(summary.most_recent_date) : "--"}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          placeholder="Filter by company"
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--background)",
          }}
        />
        <input
          value={filterTopic}
          onChange={(e) => setFilterTopic(e.target.value)}
          placeholder="Filter by topic tag"
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--background)",
          }}
        />
      </div>

      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead
            className="text-left"
            style={{
              backgroundColor: "var(--muted)",
              color: "var(--muted-foreground)",
            }}
          >
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Question</th>
              <th className="px-3 py-2">Topics</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  No questions yet. Click &ldquo;Add Question&rdquo; to capture
                  one.
                </td>
              </tr>
            )}
            {filtered.map((q) => {
              const expanded = expandedId === q.id;
              return (
                <FragmentRow key={q.id}>
                  <tr
                    className="border-t cursor-pointer hover:bg-accent"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => setExpandedId(expanded ? null : q.id)}
                  >
                    <td className="px-3 py-2">
                      {expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {q.date_asked ? formatDate(q.date_asked) : "--"}
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {q.company || "--"}
                    </td>
                    <td className="px-3 py-2">{q.role_title || "--"}</td>
                    <td className="px-3 py-2">
                      <div className="line-clamp-2 max-w-md">
                        {q.question_text}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(q.topic_tags || []).slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                            style={{
                              backgroundColor: "var(--muted)",
                              color: "var(--muted-foreground)",
                            }}
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {t}
                          </span>
                        ))}
                        {(q.topic_tags?.length || 0) > 3 && (
                          <span
                            className="text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            +{(q.topic_tags?.length || 0) - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <button
                            onClick={() => startEdit(q)}
                            className="rounded-md p-1 hover:bg-accent"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(q)}
                            disabled={deletingIds.has(q.id)}
                            className="rounded-md p-1 hover:bg-red-50 disabled:opacity-50"
                            style={{ color: "rgb(220,38,38)" }}
                            title="Delete"
                          >
                            {deletingIds.has(q.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr
                      className="border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td
                        colSpan={7}
                        className="px-6 py-4"
                        style={{ backgroundColor: "var(--muted)" }}
                      >
                        <QuestionDetail
                          q={q}
                          stories={stories}
                          storyById={storyById}
                        />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--card)",
      }}
    >
      <div
        className="text-xs uppercase"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function QuestionDetail({
  q,
  storyById,
}: {
  q: InterviewQuestion;
  stories: StoryBankStory[];
  storyById: Map<string, StoryBankStory>;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div
          className="text-xs font-semibold uppercase"
          style={{ color: "var(--muted-foreground)" }}
        >
          Question
        </div>
        <div className="mt-1 whitespace-pre-wrap">{q.question_text}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
        <Field label="Stage" value={q.interview_stage} />
        <Field label="Format" value={q.interview_format} />
        <Field label="Outcome" value={q.outcome} />
        <Field label="Status" value={q.status} />
      </div>
      {q.topic_tags && q.topic_tags.length > 0 && (
        <div>
          <div
            className="text-xs font-semibold uppercase"
            style={{ color: "var(--muted-foreground)" }}
          >
            Topics
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {q.topic_tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: "var(--background)",
                  border: "1px solid var(--border)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {q.notes && (
        <div>
          <div
            className="text-xs font-semibold uppercase"
            style={{ color: "var(--muted-foreground)" }}
          >
            Your Notes
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm">{q.notes}</div>
        </div>
      )}
      {q.model_answer && (
        <div>
          <div
            className="text-xs font-semibold uppercase"
            style={{ color: "var(--muted-foreground)" }}
          >
            Reference Answer
          </div>
          <div className="mt-1 whitespace-pre-wrap text-sm">
            {q.model_answer}
          </div>
        </div>
      )}
      {q.linked_story_ids && q.linked_story_ids.length > 0 && (
        <div>
          <div
            className="text-xs font-semibold uppercase"
            style={{ color: "var(--muted-foreground)" }}
          >
            Linked Stories
          </div>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {q.linked_story_ids.map((sid) => {
              const s = storyById.get(sid);
              return (
                <li key={sid}>
                  {s ? s.story_title : `(story ${sid.slice(0, 8)}…)`}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="font-medium">{value || "--"}</div>
    </div>
  );
}

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
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
              }}
            />
          </Labeled>

          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Company">
              <input
                value={form.company}
                onChange={update("company")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                }}
              />
            </Labeled>
            <Labeled label="Role">
              <input
                value={form.role_title}
                onChange={update("role_title")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                }}
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
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                }}
              />
            </Labeled>
            <Labeled label="Stage">
              <select
                value={form.interview_stage}
                onChange={update("interview_stage")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                }}
              >
                <option value="">--</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Format">
              <select
                value={form.interview_format}
                onChange={update("interview_format")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                }}
              >
                <option value="">--</option>
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
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
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
              }}
            />
          </Labeled>

          <Labeled label="Your Notes (how you answered / what you'd change)">
            <textarea
              value={form.notes}
              onChange={update("notes")}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
              }}
            />
          </Labeled>

          <Labeled label="Reference Answer (a 'gold' answer to study from)">
            <textarea
              value={form.model_answer}
              onChange={update("model_answer")}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
              }}
            />
          </Labeled>

          <Labeled label="Outcome">
            <select
              value={form.outcome}
              onChange={update("outcome")}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
              }}
            >
              <option value="">--</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
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
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="mb-1 block text-xs font-semibold"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
