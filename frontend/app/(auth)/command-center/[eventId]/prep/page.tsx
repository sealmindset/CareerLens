"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Monitor,
  Phone,
  RefreshCw,
  Sparkles,
  User,
  Video,
  Zap,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MarkdownContent } from "@/components/markdown-content";
import type { MeetingPrepData } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ms_teams: Monitor,
  zoom: Video,
  google_meet: Video,
  phone: Phone,
  in_person: MapPin,
  webex: Video,
};

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

function formatDateTime(iso: string | null, tz: string | null): string {
  if (!iso) return "Not scheduled";
  try {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
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

/* ------------------------------------------------------------------ */
/* Tabs Config                                                         */
/* ------------------------------------------------------------------ */

type TabKey = "briefing" | "match" | "company" | "interview" | "stories" | "star";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  field: string;
}

const TABS: TabDef[] = [
  { key: "briefing", label: "Shift Gears", icon: Zap, field: "shift_gears_briefing" },
  { key: "match", label: "Match Analysis", icon: Brain, field: "match_analysis" },
  { key: "company", label: "Company Intel", icon: Building2, field: "company_brief" },
  { key: "interview", label: "Interview Prep", icon: Briefcase, field: "interview_prep_guide" },
  { key: "stories", label: "Your Stories", icon: BookOpen, field: "story_cheatsheet" },
  { key: "star", label: "STAR Responses", icon: Sparkles, field: "star_responses" },
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function MeetingPrepPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("events", "edit");

  const [prep, setPrep] = useState<MeetingPrepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("briefing");
  const [generating, setGenerating] = useState(false);

  const loadPrep = useCallback(async () => {
    try {
      const data = await apiGet<MeetingPrepData>(`/events/${eventId}/prep`);
      setPrep(data);
      // Auto-select first tab that has content
      if (!data.shift_gears_briefing) {
        const firstWithContent = TABS.find(
          (t) => (data as unknown as Record<string, unknown>)[t.field]
        );
        if (firstWithContent) setActiveTab(firstWithContent.key);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadPrep();
  }, [loadPrep]);

  const handleGenerateBriefing = async () => {
    setGenerating(true);
    try {
      await apiPost(`/events/${eventId}/generate-prep`);
      await loadPrep();
      setActiveTab("briefing");
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!prep) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/command-center")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Command Center
        </button>
        <p className="text-muted-foreground">Event not found.</p>
      </div>
    );
  }

  const event = prep.event;
  const PlatformIcon = event.platform ? PLATFORM_ICONS[event.platform] || Monitor : null;
  const activeTabDef = TABS.find((t) => t.key === activeTab)!;
  const tabContent = (prep as unknown as Record<string, unknown>)[activeTabDef.field] as string | null;

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => router.push("/command-center")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Command Center
      </button>

      {/* Event Banner */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
              </span>
              {event.countdown_display && (
                <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
                  <Clock className="h-3 w-3" />
                  {event.countdown_display}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight">{event.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {event.contact_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {event.contact_name}
                  {event.contact_email && (
                    <span className="text-xs">({event.contact_email})</span>
                  )}
                </span>
              )}
              {PlatformIcon && (
                <span className="flex items-center gap-1">
                  <PlatformIcon className="h-3.5 w-3.5" />
                  {event.platform?.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {formatDateTime(event.scheduled_at, event.timezone)}
              </span>
              <span>{event.duration_minutes} min</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {event.meeting_link && (
              <a
                href={event.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                Join Meeting
              </a>
            )}
            {canEdit && (
              <button
                onClick={handleGenerateBriefing}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : prep.shift_gears_briefing ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {prep.shift_gears_briefing ? "Refresh Briefing" : "Generate Briefing"}
              </button>
            )}
          </div>
        </div>

        {/* Completeness bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Prep Completeness</span>
            <span>{prep.prep_completeness}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${prep.prep_completeness}%`,
                backgroundColor:
                  prep.prep_completeness >= 80
                    ? "#10b981"
                    : prep.prep_completeness >= 50
                      ? "#f59e0b"
                      : "#ef4444",
              }}
            />
          </div>
          {prep.missing_sections.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Missing: {prep.missing_sections.map((s) => s.replace(/_/g, " ")).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-1">
        {TABS.map((tab) => {
          const hasContent = !!(prep as unknown as Record<string, unknown>)[tab.field];
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {hasContent && (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        {activeTab === "stories" && prep.relevant_stories && prep.relevant_stories.length > 0 ? (
          /* Stories tab with special layout */
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Relevant Stories from Your Bank</h3>
            {tabContent && (
              <div className="prose prose-sm dark:prose-invert max-w-none mb-4">
                <MarkdownContent content={tabContent} />
              </div>
            )}
            <div className="space-y-2">
              {prep.relevant_stories.map((story) => (
                <div
                  key={story.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <h4 className="text-sm font-medium">
                    {story.story_title || "Untitled"}
                  </h4>
                  {story.hook_line && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {story.hook_line}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : tabContent ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownContent content={tabContent} />
          </div>
        ) : activeTab === "briefing" && canEdit ? (
          <div className="py-8 text-center">
            <Zap className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-muted-foreground">
              No Shift Gears briefing yet.
            </p>
            <button
              onClick={handleGenerateBriefing}
              disabled={generating}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate Briefing
            </button>
            {!prep.event.application_id && (
              <p className="mt-2 text-xs text-muted-foreground">
                This event is not linked to an application. Link it first to generate prep materials.
              </p>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <activeTabDef.icon className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-muted-foreground">
              No {activeTabDef.label.toLowerCase()} available yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Run the agent pipeline from Application Studio to generate this content.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
