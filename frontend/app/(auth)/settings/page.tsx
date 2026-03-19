"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Loader2, Settings as SettingsIcon, Cpu, User } from "lucide-react";

interface AIProviderConfig {
  provider: string;
  base_url: string | null;
  models: Record<string, string>;
}

interface ModelTierAssignment {
  tier: string;
  model: string;
  description: string;
}

export default function SettingsPage() {
  const { authMe } = useAuth();
  const [providerConfig, setProviderConfig] = useState<AIProviderConfig | null>(null);
  const [tierAssignments, setTierAssignments] = useState<ModelTierAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await apiGet<{
          provider: AIProviderConfig;
          tier_assignments: ModelTierAssignment[];
        }>("/settings");
        setProviderConfig(data.provider);
        setTierAssignments(data.tier_assignments);
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          View configuration and preferences for CareerLens.
        </p>
      </div>

      {/* AI Provider Configuration */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h2 className="text-lg font-semibold">AI Provider Configuration</h2>
        </div>
        {providerConfig ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Provider
                </label>
                <div
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  {providerConfig.provider}
                </div>
              </div>
              {providerConfig.base_url && (
                <div>
                  <label
                    className="block text-xs font-medium mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Base URL
                  </label>
                  <div
                    className="rounded-md border px-3 py-2 text-sm truncate"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                    }}
                  >
                    {providerConfig.base_url}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No AI provider configuration available.
          </p>
        )}
      </div>

      {/* Model Tier Assignments */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h2 className="text-lg font-semibold">Model Tier Assignments</h2>
        </div>
        {tierAssignments.length > 0 ? (
          <div className="rounded-md border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
                >
                  <th className="px-4 py-2.5 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>
                    Tier
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>
                    Model
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium" style={{ color: "var(--muted-foreground)" }}>
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {tierAssignments.map((assignment) => (
                  <tr
                    key={assignment.tier}
                    className="border-b last:border-b-0"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor:
                            assignment.tier === "premium"
                              ? "rgba(139,92,246,0.1)"
                              : "rgba(59,130,246,0.1)",
                          color:
                            assignment.tier === "premium"
                              ? "rgb(124,58,237)"
                              : "rgb(59,130,246)",
                        }}
                      >
                        {assignment.tier}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {assignment.model}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--muted-foreground)" }}>
                      {assignment.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No model tier assignments configured.
          </p>
        )}
      </div>

      {/* User Preferences */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <h2 className="text-lg font-semibold">User Preferences</h2>
        </div>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Display Name
              </label>
              <div
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                }}
              >
                {authMe?.name || "Not set"}
              </div>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Email
              </label>
              <div
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                }}
              >
                {authMe?.email || "Not set"}
              </div>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Role
              </label>
              <div
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                }}
              >
                {authMe?.role_name || "Not set"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
