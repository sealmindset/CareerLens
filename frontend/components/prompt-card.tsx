"use client";

import {
  Search,
  Scissors,
  GraduationCap,
  Target,
  Building,
  ClipboardList,
  Bot,
  Pencil,
  History,
  BookOpen,
  MessageCircle,
  Mic,
} from "lucide-react";
import { formatRelative } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { SafetyIndicator } from "@/components/safety-indicator";
import { VariablePillList } from "@/components/variable-pill";
import type { ManagedPrompt } from "@/lib/types";

export const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  scout: Search,
  tailor: Scissors,
  coach: GraduationCap,
  strategist: Target,
  brand_advisor: Building,
  coordinator: ClipboardList,
  experience_enhancer: MessageCircle,
  talking_points: Mic,
  story_interviewer: BookOpen,
};

export const agentColors: Record<string, string> = {
  scout: "rgb(59,130,246)",
  tailor: "rgb(139,92,246)",
  coach: "rgb(16,185,129)",
  strategist: "rgb(234,179,8)",
  brand_advisor: "rgb(236,72,153)",
  coordinator: "rgb(249,115,22)",
  experience_enhancer: "rgb(20,184,166)",
  talking_points: "rgb(168,85,247)",
  story_interviewer: "rgb(99,102,241)",
};

const tierConfig: Record<string, { bg: string; text: string; label: string }> = {
  heavy: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)", label: "Heavy" },
  standard: { bg: "rgba(59,130,246,0.1)", text: "rgb(59,130,246)", label: "Standard" },
  light: { bg: "rgba(16,185,129,0.1)", text: "rgb(16,185,129)", label: "Light" },
};

interface PromptCardProps {
  prompt: ManagedPrompt;
  canEdit: boolean;
  onEdit: (id: string) => void;
  onHistory: (id: string) => void;
  className?: string;
}

export function PromptCard({
  prompt,
  canEdit,
  onEdit,
  onHistory,
  className,
}: PromptCardProps) {
  const Icon = agentIcons[prompt.agent_name || ""] || Bot;
  const color = agentColors[prompt.agent_name || ""] || "var(--primary)";
  const tier = tierConfig[prompt.model_tier] || tierConfig.standard;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border p-4 transition-all hover:shadow-md",
        className,
      )}
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
        color: "var(--card-foreground)",
      }}
    >
      {/* Top row: agent icon + name + actions */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight">
              {prompt.name}
            </h3>
            <p className="truncate text-xs" style={{ color: "var(--muted-foreground)" }}>
              {prompt.slug}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {canEdit && (
            <button
              onClick={() => onEdit(prompt.id)}
              className="rounded-md p-1.5 transition-colors hover:bg-accent"
              title="Edit prompt"
            >
              <Pencil className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
            </button>
          )}
          <button
            onClick={() => onHistory(prompt.id)}
            className="rounded-md p-1.5 transition-colors hover:bg-accent"
            title="Version history"
            disabled={prompt.version_count === 0}
            style={{ opacity: prompt.version_count === 0 ? 0.3 : 1 }}
          >
            <History className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
          </button>
        </div>
      </div>

      {/* Description */}
      {prompt.description && (
        <p
          className="mt-2 line-clamp-2 text-xs leading-relaxed"
          style={{ color: "var(--muted-foreground)" }}
        >
          {prompt.description}
        </p>
      )}

      {/* Variables */}
      <VariablePillList content={prompt.content} className="mt-2.5" />

      {/* Footer: badges + meta */}
      <div className="mt-auto flex items-center gap-2 pt-3">
        <SafetyIndicator status={prompt.status} size="sm" />
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: tier.bg, color: tier.text }}
        >
          {tier.label}
        </span>
        {!prompt.is_active && (
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "rgb(239,68,68)" }}
          >
            Inactive
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: "var(--muted-foreground)" }}>
          v{prompt.version_count} &middot; {formatRelative(prompt.updated_at)}
        </span>
      </div>
    </div>
  );
}
