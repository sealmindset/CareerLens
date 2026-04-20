"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event } from "@/lib/types";

interface Props {
  events: Event[];
  onRefresh: () => void;
}

function groupByDate(events: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>();
  for (const ev of events) {
    if (!ev.scheduled_at) continue;
    const dateKey = new Date(ev.scheduled_at).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const arr = groups.get(dateKey) || [];
    arr.push(ev);
    groups.set(dateKey, arr);
  }
  return groups;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const prepDotColor: Record<string, string> = {
  not_started: "bg-red-500",
  in_progress: "bg-yellow-500",
  ready: "bg-green-500",
};

const eventTypeBadge: Record<string, { label: string; cls: string }> = {
  initial_call: { label: "Initial Call", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  phone_screen: { label: "Phone Screen", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  technical_interview: { label: "Technical", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  behavioral_interview: { label: "Behavioral", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  panel_interview: { label: "Panel", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  follow_up: { label: "Follow-Up", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  offer_call: { label: "Offer Call", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  other: { label: "Other", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

export function InterviewCalendar({ events, onRefresh }: Props) {
  const scheduled = useMemo(
    () =>
      events
        .filter((e) => e.scheduled_at)
        .sort(
          (a, b) =>
            new Date(a.scheduled_at!).getTime() -
            new Date(b.scheduled_at!).getTime(),
        ),
    [events],
  );

  const grouped = useMemo(() => groupByDate(scheduled), [scheduled]);

  if (scheduled.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Calendar className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No upcoming interviews scheduled.</p>
        <p className="text-xs mt-1">
          Events with dates will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([dateLabel, dayEvents]) => {
        const isToday =
          new Date(dayEvents[0].scheduled_at!).toDateString() ===
          new Date().toDateString();
        return (
          <div key={dateLabel}>
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-background pb-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span
                className={cn(
                  "text-sm font-semibold",
                  isToday && "text-blue-600 dark:text-blue-400",
                )}
              >
                {isToday ? `Today — ${dateLabel}` : dateLabel}
              </span>
              <span className="text-xs text-muted-foreground">
                ({dayEvents.length} event{dayEvents.length > 1 ? "s" : ""})
              </span>
            </div>

            <div className="space-y-2 pl-6">
              {dayEvents.map((ev) => {
                const badge = eventTypeBadge[ev.event_type] || eventTypeBadge.other;
                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30"
                  >
                    {/* Time + prep dot */}
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <span className="text-sm font-medium tabular-nums">
                        {formatTime(ev.scheduled_at!)}
                      </span>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          prepDotColor[ev.prep_status] || "bg-gray-300",
                        )}
                        title={`Prep: ${ev.prep_status}`}
                      />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>
                          {badge.label}
                        </span>
                        {ev.countdown_display && (
                          <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
                            in {ev.countdown_display}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-medium text-sm truncate">
                        {ev.title}
                      </p>
                      {(ev.job_company || ev.job_title) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {ev.job_company}
                          {ev.job_company && ev.job_title && " — "}
                          {ev.job_title}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        {ev.platform && (
                          <span className="flex items-center gap-0.5">
                            <Video className="h-3 w-3" />
                            {ev.platform.replace("_", " ")}
                          </span>
                        )}
                        {ev.location && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {ev.location}
                          </span>
                        )}
                        {ev.contact_name && (
                          <span>{ev.contact_name}</span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {ev.duration_minutes}m
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1">
                      {ev.meeting_link && (
                        <a
                          href={ev.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
                        >
                          <ExternalLink className="h-3 w-3" /> Join
                        </a>
                      )}
                      <Link
                        href={`/prep?event=${ev.id}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        <FileText className="h-3 w-3" /> Prep
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
