"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { DashboardStats } from "@/lib/types";
import {
  Briefcase,
  CalendarCheck,
  CalendarClock,
  Clock,
  FileText,
  Loader2,
  Plus,
  Trophy,
  TrendingUp,
  UserCircle,
  Bot,
  Wrench,
} from "lucide-react";
import type { Event } from "@/lib/types";

export default function DashboardPage() {
  const { authMe } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    apiGet<DashboardStats>("/dashboard")
      .then(setStats)
      .catch((err) => console.error("Failed to load dashboard:", err))
      .finally(() => setLoading(false));

    apiGet<Event[]>("/events/upcoming?limit=3")
      .then(setUpcomingEvents)
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, []);

  const statCards = stats
    ? [
        {
          label: "Total Jobs",
          value: stats.total_jobs,
          icon: Briefcase,
          color: "var(--primary)",
        },
        {
          label: "Active Applications",
          value: stats.active_applications,
          icon: FileText,
          color: "var(--primary)",
        },
        {
          label: "Interviews",
          value: stats.interviews,
          icon: CalendarCheck,
          color: "#8b5cf6",
        },
        {
          label: "Offers",
          value: stats.offers,
          icon: Trophy,
          color: "#10b981",
        },
      ]
    : [];

  const secondaryCards = stats
    ? [
        {
          label: "Match Rate",
          value: stats.match_rate,
          icon: TrendingUp,
          color: "var(--primary)",
        },
        {
          label: "Skills Count",
          value: stats.skills_count,
          icon: Wrench,
          color: "var(--primary)",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          Welcome back{authMe?.name ? `, ${authMe.name}` : ""}. Here is your job search overview.
        </p>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border"
              style={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
              }}
            />
          ))}
        </div>
      ) : stats ? (
        <>
          {/* Primary stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--card-foreground)",
                }}
              >
                <div className="flex items-center justify-between">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {card.label}
                  </p>
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                </div>
                <p className="mt-2 text-2xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Secondary stat cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {secondaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl border p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--card-foreground)",
                }}
              >
                <div className="flex items-center justify-between">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {card.label}
                  </p>
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                </div>
                <p className="mt-2 text-2xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
          >
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            {stats.recent_activity > 0 ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                You have {stats.recent_activity} recent activities in the last 7 days.
              </p>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                No recent activity. Start by adding a job or updating your profile.
              </p>
            )}
          </div>

          {/* Upcoming Events */}
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Upcoming Events
              </h2>
              <button
                onClick={() => router.push("/command-center")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all
              </button>
            </div>
            {eventsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : upcomingEvents.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                No upcoming events. Use the Command Center to create one.
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => router.push(`/command-center/${event.id}/prep`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.scheduled_at
                          ? new Date(event.scheduled_at).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Not scheduled"}
                      </p>
                    </div>
                    {event.countdown_display && (
                      <span className="flex items-center gap-1 shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
                        <Clock className="h-3 w-3" />
                        {event.countdown_display}
                      </span>
                    )}
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        event.prep_status === "ready"
                          ? "bg-green-500"
                          : event.prep_status === "in_progress"
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      title={`Prep: ${event.prep_status}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div
            className="rounded-xl border p-6"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
          >
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push("/agents")}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                <Plus className="h-4 w-4" />
                Add Job
              </button>
              <button
                onClick={() => router.push("/profile")}
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                style={{ borderColor: "var(--border)" }}
              >
                <UserCircle className="h-4 w-4" />
                View Profile
              </button>
              <button
                onClick={() => router.push("/agents")}
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                style={{ borderColor: "var(--border)" }}
              >
                <Bot className="h-4 w-4" />
                Start Agent Chat
              </button>
            </div>
          </div>
        </>
      ) : (
        <p style={{ color: "var(--muted-foreground)" }}>
          Failed to load dashboard data.
        </p>
      )}
    </div>
  );
}
