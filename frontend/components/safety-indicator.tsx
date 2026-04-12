"use client";

import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

interface SafetyIndicatorProps {
  status: string;
  hasWarnings?: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

const config: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bg: string;
}> = {
  published: {
    icon: ShieldCheck,
    label: "Published",
    color: "rgb(16,185,129)",
    bg: "rgba(16,185,129,0.1)",
  },
  testing: {
    icon: ShieldAlert,
    label: "Testing",
    color: "rgb(234,179,8)",
    bg: "rgba(234,179,8,0.1)",
  },
  draft: {
    icon: ShieldQuestion,
    label: "Draft",
    color: "rgb(156,163,175)",
    bg: "rgba(156,163,175,0.1)",
  },
};

export function SafetyIndicator({
  status,
  hasWarnings,
  size = "sm",
  showLabel = true,
  className,
}: SafetyIndicatorProps) {
  const c = config[status] || config.draft;
  const Icon = c.icon;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className,
      )}
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{hasWarnings && status !== "draft" ? `${c.label} (warnings)` : c.label}</span>}
    </span>
  );
}
