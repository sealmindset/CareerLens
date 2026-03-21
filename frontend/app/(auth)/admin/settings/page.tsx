"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPut } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRelative } from "@/lib/utils";
import {
  Database,
  Shield,
  KeyRound,
  Link2,
  Bot,
  Layers,
  Server,
  Loader2,
  Save,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  History,
  X,
  RotateCcw,
} from "lucide-react";

interface AppSetting {
  id: string;
  key: string;
  value: string | null;
  group_name: string;
  display_name: string;
  description: string | null;
  value_type: string;
  is_sensitive: boolean;
  requires_restart: boolean;
  updated_by: string | null;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  setting_key: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
}

const GROUP_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  database: {
    label: "Database",
    icon: Database,
    description: "PostgreSQL connection settings",
  },
  authentication: {
    label: "Authentication",
    icon: Shield,
    description: "OIDC identity provider configuration",
  },
  security: {
    label: "Security",
    icon: KeyRound,
    description: "JWT and security enforcement settings",
  },
  urls: {
    label: "URLs",
    icon: Link2,
    description: "Frontend and backend URL configuration",
  },
  ai_provider: {
    label: "AI Provider",
    icon: Bot,
    description: "AI model and provider configuration",
  },
  rag: {
    label: "RAG / Embeddings",
    icon: Layers,
    description: "Retrieval-augmented generation settings",
  },
  mock_services: {
    label: "Mock Services",
    icon: Server,
    description: "Local development mock service URLs",
  },
};

const GROUP_ORDER = [
  "database",
  "authentication",
  "security",
  "urls",
  "ai_provider",
  "rag",
  "mock_services",
];

export default function AdminSettingsPage() {
  const { hasPermission } = useAuth();
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string | null>>({});
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeGroup, setActiveGroup] = useState("database");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const canEdit = hasPermission("app_settings", "edit");

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiGet<AppSetting[]>("/admin/settings");
      setSettings(data);
      // Initialize edit values
      const vals: Record<string, string | null> = {};
      data.forEach((s) => {
        vals[s.key] = s.value;
      });
      setEditValues(vals);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const groupedSettings = settings.reduce(
    (acc, s) => {
      if (!acc[s.group_name]) acc[s.group_name] = [];
      acc[s.group_name].push(s);
      return acc;
    },
    {} as Record<string, AppSetting[]>,
  );

  const currentGroupSettings = groupedSettings[activeGroup] || [];

  const hasChanges = currentGroupSettings.some((s) => {
    const editVal = editValues[s.key];
    const origVal = s.value;
    // Skip masked values that weren't changed
    if (s.is_sensitive && editVal === "********") return false;
    return editVal !== origVal;
  });

  const handleReveal = async (setting: AppSetting) => {
    if (revealedKeys.has(setting.key)) {
      setRevealedKeys((prev) => {
        const next = new Set(prev);
        next.delete(setting.key);
        return next;
      });
      // Reset to masked value
      setEditValues((prev) => ({ ...prev, [setting.key]: "********" }));
      return;
    }

    try {
      const revealed = await apiGet<AppSetting>(
        `/admin/settings/${setting.id}/reveal`,
      );
      setRevealedKeys((prev) => new Set(prev).add(setting.key));
      setEditValues((prev) => ({ ...prev, [setting.key]: revealed.value }));
    } catch (err) {
      console.error("Failed to reveal setting:", err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    // Build bulk update payload for current group only
    const payload: Record<string, string | null> = {};
    currentGroupSettings.forEach((s) => {
      const editVal = editValues[s.key];
      // Only include changed values
      if (s.is_sensitive && editVal === "********") return;
      if (editVal !== s.value) {
        payload[s.key] = editVal ?? null;
      }
    });

    if (Object.keys(payload).length === 0) {
      setSaving(false);
      return;
    }

    try {
      await apiPut("/admin/settings", { settings: payload });
      setSuccessMsg("Settings saved successfully");
      setRevealedKeys(new Set());
      await fetchSettings();
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    currentGroupSettings.forEach((s) => {
      setEditValues((prev) => ({ ...prev, [s.key]: s.value }));
    });
    setRevealedKeys(new Set());
  };

  const openAuditLog = async () => {
    setShowAudit(true);
    setAuditLoading(true);
    try {
      const data = await apiGet<AuditEntry[]>("/admin/settings/audit/log?limit=50");
      setAuditLog(data);
    } catch (err) {
      console.error("Failed to load audit log:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Check if any saved settings in the current group require restart
  const restartNeeded = currentGroupSettings.some(
    (s) => s.requires_restart && editValues[s.key] !== s.value,
  );

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Application Settings
          </h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Manage application configuration. Changes are stored in the database
            with .env as fallback.
          </p>
        </div>
        <button
          onClick={openAuditLog}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
          style={{ borderColor: "var(--input)", backgroundColor: "var(--background)" }}
        >
          <History className="h-4 w-4" />
          Audit Log
        </button>
      </div>

      {/* Success / Error messages */}
      {successMsg && (
        <div
          className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: "rgb(16,185,129)",
            backgroundColor: "rgba(16,185,129,0.05)",
            color: "rgb(16,185,129)",
          }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div
          className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: "rgb(239,68,68)",
            backgroundColor: "rgba(239,68,68,0.05)",
            color: "rgb(239,68,68)",
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <nav className="w-52 shrink-0 space-y-1">
          {GROUP_ORDER.filter((g) => groupedSettings[g]).map((groupKey) => {
            const config = GROUP_CONFIG[groupKey];
            if (!config) return null;
            const Icon = config.icon;
            const isActive = activeGroup === groupKey;
            const count = (groupedSettings[groupKey] || []).length;

            return (
              <button
                key={groupKey}
                onClick={() => {
                  setActiveGroup(groupKey);
                  setSuccessMsg("");
                  setErrorMsg("");
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left"
                style={{
                  backgroundColor: isActive ? "var(--accent)" : "transparent",
                  color: isActive
                    ? "var(--accent-foreground)"
                    : "var(--muted-foreground)",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{config.label}</span>
                <span
                  className="ml-auto text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Settings form */}
        <div className="flex-1 space-y-4">
          {/* Group header */}
          {GROUP_CONFIG[activeGroup] && (
            <div className="mb-2">
              <h2 className="text-lg font-semibold">
                {GROUP_CONFIG[activeGroup].label}
              </h2>
              <p
                className="text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                {GROUP_CONFIG[activeGroup].description}
              </p>
            </div>
          )}

          {/* Restart warning */}
          {restartNeeded && (
            <div
              className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm"
              style={{
                borderColor: "rgb(234,179,8)",
                backgroundColor: "rgba(234,179,8,0.05)",
                color: "rgb(180,140,8)",
              }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Some settings in this group require a server restart to take
              effect.
            </div>
          )}

          {/* Setting fields */}
          <div
            className="rounded-xl border p-6 space-y-5"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
          >
            {currentGroupSettings.map((setting) => (
              <SettingField
                key={setting.id}
                setting={setting}
                value={editValues[setting.key] ?? ""}
                revealed={revealedKeys.has(setting.key)}
                canEdit={canEdit}
                onChange={(val) =>
                  setEditValues((prev) => ({ ...prev, [setting.key]: val }))
                }
                onToggleReveal={() => handleReveal(setting)}
              />
            ))}
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleReset}
                disabled={!hasChanges}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-30"
                style={{
                  borderColor: "var(--input)",
                  backgroundColor: "var(--background)",
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
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
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audit Log Modal */}
      {showAudit && (
        <AuditLogModal
          entries={auditLog}
          loading={auditLoading}
          onClose={() => setShowAudit(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Setting Field Component                                                    */
/* -------------------------------------------------------------------------- */

function SettingField({
  setting,
  value,
  revealed,
  canEdit,
  onChange,
  onToggleReveal,
}: {
  setting: AppSetting;
  value: string;
  revealed: boolean;
  canEdit: boolean;
  onChange: (val: string) => void;
  onToggleReveal: () => void;
}) {
  const isSensitive = setting.is_sensitive;
  const showMasked = isSensitive && !revealed;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{setting.display_name}</label>
          {setting.requires_restart && (
            <span
              className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "rgba(234,179,8,0.1)",
                color: "rgb(180,140,8)",
              }}
            >
              restart required
            </span>
          )}
          {isSensitive && (
            <span
              className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                color: "rgb(239,68,68)",
              }}
            >
              sensitive
            </span>
          )}
        </div>
        <span
          className="text-[11px] font-mono"
          style={{ color: "var(--muted-foreground)" }}
        >
          {setting.key}
        </span>
      </div>

      {setting.description && (
        <p
          className="text-xs mb-1.5"
          style={{ color: "var(--muted-foreground)" }}
        >
          {setting.description}
        </p>
      )}

      <div className="flex items-center gap-2">
        {setting.value_type === "bool" ? (
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value === "true"}
              disabled={!canEdit}
              onChange={(e) => onChange(e.target.checked ? "true" : "false")}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">
              {value === "true" ? "Enabled" : "Disabled"}
            </span>
          </label>
        ) : (
          <div className="relative flex-1">
            <input
              type={showMasked ? "password" : "text"}
              value={value ?? ""}
              disabled={!canEdit}
              onChange={(e) => onChange(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              style={{
                backgroundColor: "var(--background)",
                borderColor: "var(--border)",
              }}
            />
            {isSensitive && canEdit && (
              <button
                type="button"
                onClick={onToggleReveal}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors hover:bg-accent"
                title={revealed ? "Hide value" : "Reveal value"}
              >
                {revealed ? (
                  <EyeOff
                    className="h-4 w-4"
                    style={{ color: "var(--muted-foreground)" }}
                  />
                ) : (
                  <Eye
                    className="h-4 w-4"
                    style={{ color: "var(--muted-foreground)" }}
                  />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {setting.updated_by && (
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          Last updated by {setting.updated_by}{" "}
          {formatRelative(setting.updated_at)}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Audit Log Modal                                                            */
/* -------------------------------------------------------------------------- */

function AuditLogModal({
  entries,
  loading,
  onClose,
}: {
  entries: AuditEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-full max-w-3xl rounded-xl border shadow-lg"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-lg font-semibold">Settings Audit Log</h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Recent changes to application settings
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div
          className="overflow-y-auto p-6"
          style={{ maxHeight: "calc(80vh - 80px)" }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: "var(--primary)" }}
              />
            </div>
          ) : entries.length === 0 ? (
            <p
              className="text-sm text-center py-8"
              style={{ color: "var(--muted-foreground)" }}
            >
              No changes recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium font-mono">
                      {entry.setting_key || "Unknown"}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {entry.changed_by && `${entry.changed_by} -- `}
                      {formatRelative(entry.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="rounded px-1.5 py-0.5 font-mono"
                      style={{
                        backgroundColor: "rgba(239,68,68,0.1)",
                        color: "rgb(239,68,68)",
                      }}
                    >
                      {entry.old_value || "(empty)"}
                    </span>
                    <span style={{ color: "var(--muted-foreground)" }}>→</span>
                    <span
                      className="rounded px-1.5 py-0.5 font-mono"
                      style={{
                        backgroundColor: "rgba(16,185,129,0.1)",
                        color: "rgb(16,185,129)",
                      }}
                    >
                      {entry.new_value || "(empty)"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
