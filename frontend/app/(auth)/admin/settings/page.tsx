"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
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
  Zap,
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

interface TestConnectionResult {
  success: boolean;
  provider: string;
  model: string;
  response: string | null;
  error: string | null;
  latency_ms: number | null;
}

const GROUP_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }
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

// Provider config for the AI Provider tab
const PROVIDERS = [
  { value: "anthropic_foundry", label: "Azure AI Foundry (Anthropic)" },
  { value: "anthropic", label: "Anthropic (Direct API)" },
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama (Local)" },
];

const PROVIDER_TABS = [
  { key: "anthropic", label: "Anthropic" },
  { key: "openai", label: "OpenAI" },
  { key: "ollama", label: "Ollama" },
];

const ANTHROPIC_SUB_TABS = [
  { key: "foundry", label: "Foundry" },
  { key: "apikey", label: "API Key" },
];

// Map provider setting keys to their provider tab/sub-tab
const PROVIDER_SETTING_MAP: Record<
  string,
  { tab: string; subTab?: string; field: string }
> = {
  // Anthropic Foundry
  AZURE_AI_FOUNDRY_ENDPOINT: { tab: "anthropic", subTab: "foundry", field: "endpoint" },
  AZURE_AI_FOUNDRY_API_KEY: { tab: "anthropic", subTab: "foundry", field: "apikey" },
  ANTHROPIC_FOUNDRY_MODEL_HEAVY: { tab: "anthropic", subTab: "foundry", field: "model" },
  ANTHROPIC_FOUNDRY_MODEL_STANDARD: { tab: "anthropic", subTab: "foundry", field: "model" },
  ANTHROPIC_FOUNDRY_MODEL_LIGHT: { tab: "anthropic", subTab: "foundry", field: "model" },
  // Anthropic Direct
  ANTHROPIC_API_KEY: { tab: "anthropic", subTab: "apikey", field: "apikey" },
  ANTHROPIC_MODEL_HEAVY: { tab: "anthropic", subTab: "apikey", field: "model" },
  ANTHROPIC_MODEL_STANDARD: { tab: "anthropic", subTab: "apikey", field: "model" },
  ANTHROPIC_MODEL_LIGHT: { tab: "anthropic", subTab: "apikey", field: "model" },
  // OpenAI
  OPENAI_API_KEY: { tab: "openai", field: "apikey" },
  OPENAI_MODEL_HEAVY: { tab: "openai", field: "model" },
  OPENAI_MODEL_STANDARD: { tab: "openai", field: "model" },
  OPENAI_MODEL_LIGHT: { tab: "openai", field: "model" },
  // Ollama
  OLLAMA_BASE_URL: { tab: "ollama", field: "endpoint" },
  OLLAMA_MODEL_HEAVY: { tab: "ollama", field: "model" },
  OLLAMA_MODEL_STANDARD: { tab: "ollama", field: "model" },
  OLLAMA_MODEL_LIGHT: { tab: "ollama", field: "model" },
};

// Keys that are displayed outside the provider tabs (just the provider selector)
const AI_PROVIDER_KEY = "AI_PROVIDER";

export default function AdminSettingsPage() {
  const { hasPermission } = useAuth();
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [editValues, setEditValues] = useState<Record<string, string | null>>(
    {},
  );
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeGroup, setActiveGroup] = useState("database");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // AI Provider tab state
  const [providerTab, setProviderTab] = useState("anthropic");
  const [anthropicSubTab, setAnthropicSubTab] = useState("foundry");

  const canEdit = hasPermission("app_settings", "edit");

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiGet<AppSetting[]>("/admin/settings");
      setSettings(data);
      const vals: Record<string, string | null> = {};
      data.forEach((s) => {
        vals[s.key] = s.value;
      });
      setEditValues(vals);

      // Set initial provider tab based on AI_PROVIDER value
      const provider = data.find((s) => s.key === "AI_PROVIDER")?.value;
      if (provider === "anthropic_foundry") {
        setProviderTab("anthropic");
        setAnthropicSubTab("foundry");
      } else if (provider === "anthropic") {
        setProviderTab("anthropic");
        setAnthropicSubTab("apikey");
      } else if (provider === "openai") {
        setProviderTab("openai");
      } else if (provider === "ollama") {
        setProviderTab("ollama");
      }
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

  // For non-AI groups, use generic field rendering
  const currentGroupSettings =
    activeGroup === "ai_provider"
      ? [] // AI provider has custom rendering
      : groupedSettings[activeGroup] || [];

  const aiSettings = groupedSettings["ai_provider"] || [];

  // Get settings for current provider tab/sub-tab
  const getProviderSettings = () => {
    return aiSettings.filter((s) => {
      const mapping = PROVIDER_SETTING_MAP[s.key];
      if (!mapping) return false;
      if (mapping.tab !== providerTab) return false;
      if (providerTab === "anthropic" && mapping.subTab !== anthropicSubTab)
        return false;
      return true;
    });
  };

  const allActiveGroupSettings =
    activeGroup === "ai_provider"
      ? aiSettings
      : currentGroupSettings;

  const hasChanges = allActiveGroupSettings.some((s) => {
    const editVal = editValues[s.key];
    const origVal = s.value;
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

    // Build bulk update for ALL settings in this group
    const settingsToSave = allActiveGroupSettings;
    const payload: Record<string, string | null> = {};
    settingsToSave.forEach((s) => {
      const editVal = editValues[s.key];
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
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    allActiveGroupSettings.forEach((s) => {
      setEditValues((prev) => ({ ...prev, [s.key]: s.value }));
    });
    setRevealedKeys(new Set());
  };

  const openAuditLog = async () => {
    setShowAudit(true);
    setAuditLoading(true);
    try {
      const data = await apiGet<AuditEntry[]>(
        "/admin/settings/audit/log?limit=50",
      );
      setAuditLog(data);
    } catch (err) {
      console.error("Failed to load audit log:", err);
    } finally {
      setAuditLoading(false);
    }
  };

  const restartNeeded = allActiveGroupSettings.some(
    (s) =>
      s.requires_restart && editValues[s.key] !== s.value,
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
          style={{
            borderColor: "var(--input)",
            backgroundColor: "var(--background)",
          }}
        >
          <History className="h-4 w-4" />
          Audit Log
        </button>
      </div>

      {/* Success / Error */}
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

        {/* Settings content */}
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

          {/* Content: custom for AI Provider, generic for others */}
          {activeGroup === "ai_provider" ? (
            <AIProviderPanel
              settings={aiSettings}
              editValues={editValues}
              revealedKeys={revealedKeys}
              canEdit={canEdit}
              providerTab={providerTab}
              setProviderTab={setProviderTab}
              anthropicSubTab={anthropicSubTab}
              setAnthropicSubTab={setAnthropicSubTab}
              onChange={(key, val) =>
                setEditValues((prev) => ({ ...prev, [key]: val }))
              }
              onToggleReveal={handleReveal}
              getProviderSettings={getProviderSettings}
            />
          ) : (
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
                    setEditValues((prev) => ({
                      ...prev,
                      [setting.key]: val,
                    }))
                  }
                  onToggleReveal={() => handleReveal(setting)}
                />
              ))}
            </div>
          )}

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
/*  AI Provider Panel -- custom tabbed UI                                      */
/* -------------------------------------------------------------------------- */

function AIProviderPanel({
  settings,
  editValues,
  revealedKeys,
  canEdit,
  providerTab,
  setProviderTab,
  anthropicSubTab,
  setAnthropicSubTab,
  onChange,
  onToggleReveal,
  getProviderSettings,
}: {
  settings: AppSetting[];
  editValues: Record<string, string | null>;
  revealedKeys: Set<string>;
  canEdit: boolean;
  providerTab: string;
  setProviderTab: (tab: string) => void;
  anthropicSubTab: string;
  setAnthropicSubTab: (tab: string) => void;
  onChange: (key: string, val: string) => void;
  onToggleReveal: (setting: AppSetting) => void;
  getProviderSettings: () => AppSetting[];
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiPost<TestConnectionResult>(
        "/admin/settings/test-connection",
        {},
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        provider: editValues[AI_PROVIDER_KEY] ?? "unknown",
        model: "unknown",
        response: null,
        error: err instanceof Error ? err.message : "Request failed",
        latency_ms: null,
      });
    } finally {
      setTesting(false);
    }
  };

  const providerSetting = settings.find((s) => s.key === AI_PROVIDER_KEY);
  const currentProvider = editValues[AI_PROVIDER_KEY] ?? "anthropic_foundry";

  // Determine which provider tab is "active" (matches the selected provider)
  const activeProviderTab =
    currentProvider === "anthropic_foundry" || currentProvider === "anthropic"
      ? "anthropic"
      : currentProvider === "openai"
        ? "openai"
        : "ollama";

  const providerSettings = getProviderSettings();

  // Split into connection settings and model settings
  const connectionSettings = providerSettings.filter(
    (s) => !s.key.includes("MODEL_"),
  );
  const modelSettings = providerSettings.filter((s) =>
    s.key.includes("MODEL_"),
  );

  // Sort models: heavy, standard, light
  const tierOrder = ["HEAVY", "STANDARD", "LIGHT"];
  modelSettings.sort((a, b) => {
    const aIdx = tierOrder.findIndex((t) => a.key.includes(t));
    const bIdx = tierOrder.findIndex((t) => b.key.includes(t));
    return aIdx - bIdx;
  });

  return (
    <div className="space-y-4">
      {/* Provider selector */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Active AI Provider</label>
          {providerSetting && (
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--muted-foreground)" }}
            >
              AI_PROVIDER
            </span>
          )}
        </div>
        <p
          className="text-xs mb-2"
          style={{ color: "var(--muted-foreground)" }}
        >
          Select which AI provider to use. Each provider has its own connection
          settings and model assignments.
        </p>
        <select
          value={currentProvider}
          disabled={!canEdit}
          onChange={(e) => onChange(AI_PROVIDER_KEY, e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Active indicator + Test button */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  providerTab === activeProviderTab
                    ? "rgb(16,185,129)"
                    : "var(--muted-foreground)",
              }}
            />
            <span
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {providerTab === activeProviderTab
                ? "Viewing active provider"
                : `Active provider is ${PROVIDERS.find((p) => p.value === currentProvider)?.label}`}
            </span>
          </div>
          {canEdit && (
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
              style={{
                borderColor: "var(--input)",
                backgroundColor: "var(--background)",
              }}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {testing ? "Testing..." : "Test Connection"}
            </button>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className="mt-3 rounded-md border px-4 py-3 text-sm"
            style={{
              borderColor: testResult.success
                ? "rgb(16,185,129)"
                : "rgb(239,68,68)",
              backgroundColor: testResult.success
                ? "rgba(16,185,129,0.05)"
                : "rgba(239,68,68,0.05)",
            }}
          >
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 mt-0.5"
                  style={{ color: "rgb(16,185,129)" }}
                />
              ) : (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 mt-0.5"
                  style={{ color: "rgb(239,68,68)" }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="font-medium"
                  style={{
                    color: testResult.success
                      ? "rgb(16,185,129)"
                      : "rgb(239,68,68)",
                  }}
                >
                  {testResult.success
                    ? "Connection successful"
                    : "Connection failed"}
                </p>
                <div
                  className="mt-1 space-y-0.5 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <p>
                    Provider: <span className="font-mono">{testResult.provider}</span>
                    {" | "}Model: <span className="font-mono">{testResult.model}</span>
                    {testResult.latency_ms != null && (
                      <>{" | "}{testResult.latency_ms}ms</>
                    )}
                  </p>
                  {testResult.success && testResult.response && (
                    <p>
                      Response: <span className="font-mono">&quot;{testResult.response}&quot;</span>
                    </p>
                  )}
                  {!testResult.success && testResult.error && (
                    <p className="break-all" style={{ color: "rgb(239,68,68)" }}>
                      {testResult.error}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Provider tabs */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        {/* Main tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: "var(--border)" }}
        >
          {PROVIDER_TABS.map((tab) => {
            const isActive = providerTab === tab.key;
            const isActiveProvider = activeProviderTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setProviderTab(tab.key)}
                className="relative flex-1 px-4 py-3 text-sm font-medium transition-colors"
                style={{
                  color: isActive
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
                  backgroundColor: isActive
                    ? "var(--card)"
                    : "var(--muted)",
                }}
              >
                {tab.label}
                {isActiveProvider && (
                  <span
                    className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "rgb(16,185,129)" }}
                  />
                )}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: "var(--primary)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Anthropic sub-tabs */}
        {providerTab === "anthropic" && (
          <div
            className="flex border-b px-4"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--muted)",
            }}
          >
            {ANTHROPIC_SUB_TABS.map((sub) => {
              const isActive = anthropicSubTab === sub.key;
              return (
                <button
                  key={sub.key}
                  onClick={() => setAnthropicSubTab(sub.key)}
                  className="relative px-3 py-2 text-xs font-medium transition-colors"
                  style={{
                    color: isActive
                      ? "var(--foreground)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {sub.label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-0.5"
                      style={{ backgroundColor: "var(--primary)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Tab content */}
        <div className="p-6 space-y-5">
          {/* Connection settings */}
          {connectionSettings.length > 0 && (
            <>
              <h3
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Connection
              </h3>
              {connectionSettings.map((setting) => (
                <SettingField
                  key={setting.id}
                  setting={setting}
                  value={editValues[setting.key] ?? ""}
                  revealed={revealedKeys.has(setting.key)}
                  canEdit={canEdit}
                  onChange={(val) => onChange(setting.key, val)}
                  onToggleReveal={() => onToggleReveal(setting)}
                />
              ))}
            </>
          )}

          {/* Model assignments */}
          {modelSettings.length > 0 && (
            <>
              <h3
                className="text-xs font-semibold uppercase tracking-wider pt-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Model Assignments
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {modelSettings.map((setting) => {
                  const tier = setting.key.includes("HEAVY")
                    ? "Heavy"
                    : setting.key.includes("STANDARD")
                      ? "Standard"
                      : "Light";
                  const tierColor =
                    tier === "Heavy"
                      ? "rgb(139,92,246)"
                      : tier === "Standard"
                        ? "rgb(59,130,246)"
                        : "rgb(16,185,129)";
                  const tierDesc =
                    tier === "Heavy"
                      ? "Complex reasoning"
                      : tier === "Standard"
                        ? "Analysis tasks"
                        : "Simple tasks";

                  return (
                    <div key={setting.id}>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: `${tierColor}15`,
                            color: tierColor,
                          }}
                        >
                          {tier}
                        </span>
                      </div>
                      <p
                        className="text-[11px] mb-1"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {tierDesc}
                      </p>
                      <input
                        type="text"
                        value={editValues[setting.key] ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => onChange(setting.key, e.target.value)}
                        className="w-full rounded-md border px-2.5 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                        style={{
                          backgroundColor: "var(--background)",
                          borderColor: "var(--border)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {providerSettings.length === 0 && (
            <p
              className="text-sm py-4 text-center"
              style={{ color: "var(--muted-foreground)" }}
            >
              No settings found for this provider configuration.
            </p>
          )}
        </div>
      </div>
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
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-lg font-semibold">Settings Audit Log</h2>
            <p
              className="text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
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
                    <span style={{ color: "var(--muted-foreground)" }}>
                      →
                    </span>
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
