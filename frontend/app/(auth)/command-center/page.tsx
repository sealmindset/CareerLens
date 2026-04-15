"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Monitor,
  Pencil,
  Phone,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  Video,
} from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Event, NoteParseResult } from "@/lib/types";

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
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("events", "create");
  const canEdit = hasPermission("events", "edit");
  const canDelete = hasPermission("events", "delete");

  // Events list
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  // Note input
  const [rawNote, setRawNote] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<NoteParseResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Manual create
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState("initial_call");
  const [manualDate, setManualDate] = useState("");
  const [manualPlatform, setManualPlatform] = useState("");
  const [manualContact, setManualContact] = useState("");
  const [manualCreating, setManualCreating] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      const params = showPast ? "" : "?upcoming=true&days=90";
      const data = await apiGet<Event[]>(`/events${params}`);
      setEvents(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [showPast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Parse note
  const handleParse = async () => {
    if (!rawNote.trim()) return;
    setParsing(true);
    setParseResult(null);
    setOverrides({});
    setSuccessMessage("");
    try {
      const result = await apiPost<NoteParseResult>("/events/parse-note", {
        raw_note: rawNote,
      });
      setParseResult(result);
    } catch {
      // ignore
    } finally {
      setParsing(false);
    }
  };

  // Create from note
  const handleCreateFromNote = async () => {
    if (!rawNote.trim()) return;
    setCreating(true);
    try {
      const cleanOverrides: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(overrides)) {
        if (value !== null && value !== undefined) {
          cleanOverrides[key] = value;
        }
      }
      await apiPost<Event>("/events/from-note", {
        raw_note: rawNote,
        overrides: Object.keys(cleanOverrides).length > 0 ? cleanOverrides : null,
      });
      setSuccessMessage("Event created successfully!");
      setRawNote("");
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

  // Manual create
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

  // Delete event
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      await apiDelete(`/events/${id}`);
      await loadEvents();
    } catch {
      // ignore
    }
  };

  // Parse result field with override
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
              Drop a note, JARVIS handles the rest
            </p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowManual(!showManual)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Manual Event
          </button>
        )}
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
          {successMessage}
        </div>
      )}

      {/* Quick Note Input */}
      {canCreate && (
        <div
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-semibold">Quick Note</h2>
          </div>
          <textarea
            value={rawNote}
            onChange={(e) => setRawNote(e.target.value)}
            placeholder='e.g. "Dylan Cole reached out about Sr. App Security Engineer at Wealth Enhancement Group, 1 pm CST Thursday, MS Teams"'
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleParse}
              disabled={parsing || !rawNote.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Parse Note
            </button>
            {parseResult && (
              <button
                onClick={handleCreateFromNote}
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Confirm & Create
              </button>
            )}
          </div>

          {/* Parse preview */}
          {parseResult && (
            <div className="mt-4 rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold mb-3">
                Parsed Fields
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (click to edit)
                </span>
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
                      <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">
                        {label}:
                      </span>
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
              {/* Show empty fields as add-able */}
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
            </div>
          )}
        </div>
      )}

      {/* Manual Create Form */}
      {showManual && canCreate && (
        <div
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="text-sm font-semibold mb-3">Create Event Manually</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Interview with Acme Corp"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Event Type</label>
              <select
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Scheduled At</label>
              <input
                type="datetime-local"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Platform</label>
              <select
                value={manualPlatform}
                onChange={(e) => setManualPlatform(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
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
              <input
                type="text"
                value={manualContact}
                onChange={(e) => setManualContact(e.target.value)}
                placeholder="John Smith"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleManualCreate}
              disabled={manualCreating || !manualTitle.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {manualCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Event
            </button>
            <button
              onClick={() => setShowManual(false)}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Events Timeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            {showPast ? "All Events" : "Upcoming Events"}
          </h2>
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showPast ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Show Upcoming Only
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Show All Events
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-muted-foreground">
              No upcoming events. Drop a note above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const prepStatus = PREP_STATUS_COLORS[event.prep_status] || PREP_STATUS_COLORS.not_started;
              const PlatformIcon = event.platform ? PLATFORM_ICONS[event.platform] || Monitor : null;

              return (
                <div
                  key={event.id}
                  className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/30"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Event info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full ${prepStatus.dot}`}
                          title={`Prep: ${prepStatus.label}`}
                        />
                        {event.countdown_display && (
                          <span className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                            <Clock className="h-3 w-3" />
                            {event.countdown_display}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold truncate">{event.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {event.job_company && (
                          <span>{event.job_company}</span>
                        )}
                        {event.contact_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {event.contact_name}
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

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {event.meeting_link && (
                        <a
                          href={event.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Join
                        </a>
                      )}
                      <button
                        onClick={() => router.push(`/command-center/${event.id}/prep`)}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <Sparkles className="h-3 w-3" />
                        Prep
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => router.push(`/command-center/${event.id}/prep`)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(event.id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
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
  );
}
