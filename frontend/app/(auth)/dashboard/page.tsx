"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { DashboardStats } from "@/lib/types";
import {
  Briefcase,
  FileText,
  CalendarCheck,
  Trophy,
  TrendingUp,
  Wrench,
  Plus,
  UserCircle,
  Bot,
} from "lucide-react";

export default function DashboardPage() {
  const { authMe } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<DashboardStats>("/dashboard")
      .then(setStats)
      .catch((err) => console.error("Failed to load dashboard:", err))
      .finally(() => setLoading(false));
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
                onClick={() => router.push("/jobs")}
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
