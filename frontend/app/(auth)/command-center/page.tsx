"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  ListTodo,
  Loader2,
  MapPin,
  MessageSquare,
  Monitor,
  Pencil,
  Phone,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  Video,
  Zap,
} from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TaskList } from "@/components/task-list";
import type { Event, NoteParseResult, Task, QuickCapture, QuickCaptureProcessResult } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const EVENT_TYPE_LABELS: Record<string, string> = {
  initial_call: "Initial Call",
  phone_screen: "Phone Screen",
  technical_interview: "Technical Interview",
  behavioral_interview: "Behavioral Interview",
  panel_interview: "Panel Interview",
  follow_up: "Follow-up",
  offer_call: "Offer Call",
  other: "Other",
};

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ms_teams: Monitor,
  zoom: Video,
  google_meet: Video,
  phone: Phone,
  in_person: MapPin,
  webex: Video,
};

const PREP_STATUS_COLORS: Record<string, { dot: string; label: string }> = {
  not_started: { dot: "bg-red-500", label: "Not Started" },
  in_progress: { dot: "bg-yellow-500", label: "In Progress" },
  ready: { dot: "bg-green-500", label: "Ready" },
};

function formatDateTime(iso: string | null, tz: string | null): string {
  if (!iso) return "Not scheduled";
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr} at ${timeStr}${tz ? ` ${tz}` : ""}`;
  } catch {
    return iso;
  }
}

function confidenceColor(score: number | undefined): string {
  if (score === undefined) return "bg-gray-400";
  if (score >= 0.8) return "bg-green-500";
  if (score >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CommandCenterPage() {
  const router = useRouter();
  const { authMe, hasPermission } = useAuth();
  const canCreateEvents = hasPermission("events", "create");
  const canEditEvents = hasPermission("events", "edit");
  const canDeleteEvents = hasPermission("events", "delete");
  const canCreateCaptures = hasPermission("quick_captures", "create");
  const canViewTasks = hasPermission("tasks", "view");

  // Events
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);

  // Quick Capture
  const [captureText, setCaptureText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [processResult, setProcessResult] = useState<QuickCaptureProcessResult | null>(null);
  const [unprocessedCaptures, setUnprocessedCaptures] = useState<QuickCapture[]>([]);

  // Legacy note parsing (for event creation)
  const [parseResult, setParseResult] = useState<NoteParseResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Manual event create
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState("initial_call");
  const [manualDate, setManualDate] = useState("");
  const [manualPlatform, setManualPlatform] = useState("");
  const [manualContact, setManualContact] = useState("");
  const [manualCreating, setManualCreating] = useState(false);

  // Manual task create
  const [showManualTask, setShowManualTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskCreating, setTaskCreating] = useState(false);

  /* ---- Data loading ---- */

  const loadEvents = useCallback(async () => {
    try {
      const params = showPast ? "" : "?upcoming=true&days=90";
      const data = await apiGet<Event[]>(`/events${params}`);
      setEvents(data);
    } catch {
      // ignore
    } finally {
      setEventsLoading(false);
    }
  }, [showPast]);

  const loadTasks = useCallback(async () => {
    try {
      const data = await apiGet<Task[]>("/tasks");
      setTasks(data);
      const count = await apiGet<{ count: number }>("/tasks/pending-count");
      setPendingCount(count.count);
    } catch {
      // ignore
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadCaptures = useCallback(async () => {
    try {
      const data = await apiGet<QuickCapture[]>("/quick-captures?processed=false");
      setUnprocessedCaptures(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadEvents();
    loadTasks();
    loadCaptures();
  }, [loadEvents, loadTasks, loadCaptures]);

  /* ---- Quick Capture ---- */

  const handleQuickCapture = async () => {
    if (!captureText.trim()) return;
    setCapturing(true);
    setProcessResult(null);
    setSuccessMessage("");
    try {
      // Create capture
      const capture = await apiPost<QuickCapture>("/quick-captures", {
        raw_text: captureText,
      });
      // Process it with AI
      const result = await apiPost<QuickCaptureProcessResult>(
        `/quick-captures/${capture.id}/process`,
        {}
      );
      setProcessResult(result);
      setCaptureText("");
      setSuccessMessage(
        result.classification === "event"
          ? "Event created! Tasks extracted too."
          : result.tasks_created.length > 0
            ? `${result.tasks_created.length} task(s) extracted`
            : "Note captured"
      );
      // Refresh all data
      await Promise.all([loadEvents(), loadTasks(), loadCaptures()]);
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch {
      // ignore
    } finally {
      setCapturing(false);
    }
  };

  const handleProcessCapture = async (captureId: string) => {
    try {
      await apiPost<QuickCaptureProcessResult>(
        `/quick-captures/${captureId}/process`,
        {}
      );
      await Promise.all([loadTasks(), loadCaptures()]);
    } catch {
      // ignore
    }
  };

  /* ---- Legacy note parsing (event-focused) ---- */

  const handleParse = async () => {
    if (!captureText.trim()) return;
    setCapturing(true);
    setParseResult(null);
    setOverrides({});
    try {
      const result = await apiPost<NoteParseResult>("/events/parse-note", {
        raw_note: captureText,
      });
      setParseResult(result);
    } catch {
      // ignore
    } finally {
      setCapturing(false);
    }
  };

  const handleCreateFromNote = async () => {
    if (!captureText.trim()) return;
    setCreating(true);
    try {
      const cleanOverrides: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(overrides)) {
        if (value !== null && value !== undefined) {
          cleanOverrides[key] = value;
        }
      }
      await apiPost<Event>("/events/from-note", {
        raw_note: captureText,
        overrides: Object.keys(cleanOverrides).length > 0 ? cleanOverrides : null,
      });
      setSuccessMessage("Event created successfully!");
      setCaptureText("");
      setParseResult(null);
      setOverrides({});
      await loadEvents();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  /* ---- Manual event create ---- */

  const handleManualCreate = async () => {
    if (!manualTitle.trim()) return;
    setManualCreating(true);
    try {
      await apiPost<Event>("/events", {
        title: manualTitle,
        event_type: manualType,
        scheduled_at: manualDate || null,
        platform: manualPlatform || null,
        contact_name: manualContact || null,
      });
      setManualTitle("");
      setManualType("initial_call");
      setManualDate("");
      setManualPlatform("");
      setManualContact("");
      setShowManual(false);
      await loadEvents();
    } catch {
      // ignore
    } finally {
      setManualCreating(false);
    }
  };

  /* ---- Manual task create ---- */

  const handleManualTaskCreate = async () => {
    if (!taskTitle.trim()) return;
    setTaskCreating(true);
    try {
      await apiPost<Task>("/tasks", {
        title: taskTitle,
        priority: taskPriority,
        due_date: taskDueDate || null,
        source_type: "manual",
      });
      setTaskTitle("");
      setTaskPriority("normal");
      setTaskDueDate("");
      setShowManualTask(false);
      await loadTasks();
    } catch {
      // ignore
    } finally {
      setTaskCreating(false);
    }
  };

  /* ---- Delete event ---- */

  const handleDeleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      await apiDelete(`/events/${id}`);
      await loadEvents();
    } catch {
      // ignore
    }
  };

  /* ---- Parse result helpers ---- */

  const getFieldValue = (field: string): string | null => {
    if (field in overrides) return overrides[field];
    if (parseResult) return (parseResult as unknown as Record<string, unknown>)[field] as string | null;
    return null;
  };

  const setFieldOverride = (field: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [field]: value || null }));
  };

  const parseFields = [
    { key: "contact_name", label: "Contact" },
    { key: "company", label: "Company" },
    { key: "role_title", label: "Role" },
    { key: "event_type", label: "Event Type" },
    { key: "scheduled_time", label: "Scheduled" },
    { key: "timezone", label: "Timezone" },
    { key: "platform", label: "Platform" },
    { key: "location", label: "Location" },
    { key: "job_type", label: "Job Type" },
    { key: "source", label: "Source" },
    { key: "contract_details", label: "Contract Details" },
    { key: "additional_notes", label: "Notes" },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
            <p className="text-sm text-muted-foreground">
              {authMe?.name ? `Welcome back, ${authMe.name.split(" ")[0]}` : "Your JARVIS-powered mission control"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCreateEvents && (
            <button
              onClick={() => setShowManual(!showManual)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              Event
            </button>
          )}
          {canViewTasks && (
            <button
              onClick={() => setShowManualTask(!showManualTask)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <ListTodo className="h-4 w-4" />
              Task
            </button>
          )}
        </div>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
          <Sparkles className="mr-1.5 inline-block h-4 w-4" />
          {successMessage}
        </div>
      )}

      {/* Quick Capture */}
      {canCreateCaptures && (
        <div
          className="rounded-xl border p-6"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Quick Capture</h2>
            <span className="text-xs text-muted-foreground">
              Drop a note — JARVIS extracts tasks, events, and action items
            </span>
          </div>
          <textarea
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            placeholder='e.g. "Need to follow up with Dylan at Wealth Enhancement by Friday. Also prep for the technical interview next Tuesday at 1pm CST on Teams."'
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleQuickCapture();
              }
            }}
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleQuickCapture}
              disabled={capturing || !captureText.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {capturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Capture & Process
            </button>
            <button
              onClick={handleParse}
              disabled={capturing || !captureText.trim()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Parse as Event
            </button>
            <span className="text-xs text-muted-foreground">
              {"\u2318"}+Enter to capture
            </span>
          </div>

          {/* Process result summary */}
          {processResult && (
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-semibold">
                  JARVIS classified this as: <span className="text-primary">{processResult.classification}</span>
                </span>
              </div>
              {processResult.summary && (
                <p className="text-sm text-muted-foreground mb-2">{processResult.summary}</p>
              )}
              {processResult.tasks_created.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Tasks created:</p>
                  {processResult.tasks_created.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 rounded-full ${
                        t.priority === "urgent" ? "bg-red-500" :
                        t.priority === "important" ? "bg-orange-500" :
                        t.priority === "normal" ? "bg-blue-500" : "bg-gray-400"
                      }`} />
                      <span>{t.title}</span>
                      {t.due_date && (
                        <span className="text-xs text-muted-foreground">
                          (due {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {processResult.event_created && (
                <p className="text-sm mt-1">
                  <CalendarClock className="inline h-3.5 w-3.5 mr-1 text-teal-500" />
                  Event created: {processResult.event_created.title}
                </p>
              )}
            </div>
          )}

          {/* Parse preview (legacy event parsing) */}
          {parseResult && !processResult && (
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold mb-3">
                Parsed Fields
                <span className="ml-2 text-xs font-normal text-muted-foreground">(click to edit)</span>
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {parseFields.map(({ key, label }) => {
                  const value = getFieldValue(key);
                  const confidence = parseResult.confidence?.[key];
                  if (!value && !(key in overrides)) return null;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${confidenceColor(confidence)}`}
                        title={confidence !== undefined ? `${Math.round(confidence * 100)}% confidence` : "No confidence score"}
                      />
                      <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">{label}:</span>
                      <input
                        type="text"
                        value={value || ""}
                        onChange={(e) => setFieldOverride(key, e.target.value)}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {parseFields
                  .filter(({ key }) => !getFieldValue(key) && !(key in overrides))
                  .map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setFieldOverride(key, "")}
                      className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                    >
                      + {label}
                    </button>
                  ))}
              </div>
              <div className="mt-3">
                <button
                  onClick={handleCreateFromNote}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Confirm & Create Event
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unprocessed captures queue */}
      {unprocessedCaptures.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-amber-600" />
            Unprocessed Notes ({unprocessedCaptures.length})
          </h3>
          <div className="space-y-2">
            {unprocessedCaptures.map((cap) => (
              <div key={cap.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <p className="flex-1 text-sm truncate">{cap.raw_text}</p>
                <button
                  onClick={() => handleProcessCapture(cap.id)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Sparkles className="h-3 w-3" />
                  Process
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual task form */}
      {showManualTask && canViewTasks && (
        <div className="rounded-xl border p-6" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3">Add Task</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Follow up with recruiter"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleManualTaskCreate();
                  }
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="urgent">Urgent</option>
                <option value="important">Important</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleManualTaskCreate}
              disabled={taskCreating || !taskTitle.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {taskCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Task
            </button>
            <button onClick={() => setShowManualTask(false)} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual event form */}
      {showManual && canCreateEvents && (
        <div className="rounded-xl border p-6" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold mb-3">Create Event Manually</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <input type="text" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Interview with Acme Corp" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Event Type</label>
              <select value={manualType} onChange={(e) => setManualType(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Scheduled At</label>
              <input type="datetime-local" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Platform</label>
              <select value={manualPlatform} onChange={(e) => setManualPlatform(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">None</option>
                <option value="ms_teams">MS Teams</option>
                <option value="zoom">Zoom</option>
                <option value="google_meet">Google Meet</option>
                <option value="phone">Phone</option>
                <option value="in_person">In Person</option>
                <option value="webex">Webex</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Contact Name</label>
              <input type="text" value={manualContact} onChange={(e) => setManualContact(e.target.value)} placeholder="John Smith" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={handleManualCreate} disabled={manualCreating || !manualTitle.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {manualCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Event
            </button>
            <button onClick={() => setShowManual(false)} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      {/* Two-column: Tasks + Events */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Task Inbox */}
        {canViewTasks && (
          <div className="rounded-xl border p-6" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-primary" />
                Task Inbox
                {pendingCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {pendingCount}
                  </span>
                )}
              </h2>
              <button
                onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showCompletedTasks ? "Hide completed" : "Show completed"}
              </button>
            </div>
            {tasksLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <TaskList
                tasks={tasks}
                onTaskUpdated={loadTasks}
                showCompleted={showCompletedTasks}
              />
            )}
          </div>
        )}

        {/* Events Timeline */}
        <div className="rounded-xl border p-6" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-teal-500" />
              {showPast ? "All Events" : "Upcoming Events"}
            </h2>
            <button
              onClick={() => setShowPast(!showPast)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showPast ? (
                <><ChevronUp className="h-3.5 w-3.5" /> Upcoming Only</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5" /> Show All</>
              )}
            </button>
          </div>

          {eventsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No upcoming events
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const prepStatus = PREP_STATUS_COLORS[event.prep_status] || PREP_STATUS_COLORS.not_started;
                const PlatformIcon = event.platform ? PLATFORM_ICONS[event.platform] || Monitor : null;

                return (
                  <div
                    key={event.id}
                    className="rounded-lg border bg-card p-3 transition-colors hover:border-primary/30"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                          </span>
                          <span className={`h-2 w-2 rounded-full ${prepStatus.dot}`} title={`Prep: ${prepStatus.label}`} />
                          {event.countdown_display && (
                            <span className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                              <Clock className="h-3 w-3" />
                              {event.countdown_display}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold truncate">{event.title}</h3>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {event.contact_name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />{event.contact_name}
                            </span>
                          )}
                          {PlatformIcon && (
                            <span className="flex items-center gap-1">
                              <PlatformIcon className="h-3 w-3" />
                              {event.platform?.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(event.scheduled_at, event.timezone)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {event.meeting_link && (
                          <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
                            <ExternalLink className="h-3 w-3" />Join
                          </a>
                        )}
                        <button onClick={() => router.push(`/command-center/${event.id}/prep`)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                          <Sparkles className="h-3 w-3" />Prep
                        </button>
                        {canDeleteEvents && (
                          <button onClick={() => handleDeleteEvent(event.id)} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
