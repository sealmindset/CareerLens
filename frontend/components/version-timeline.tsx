"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, User } from "lucide-react";
import { formatRelative, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { PromptVersion } from "@/lib/types";

interface VersionTimelineProps {
  versions: PromptVersion[];
  maxVisible?: number;
  onRestore?: (version: PromptVersion) => void;
  className?: string;
}

export function VersionTimeline({
  versions,
  maxVisible = 10,
  onRestore,
  className,
}: VersionTimelineProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? versions : versions.slice(0, maxVisible);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (versions.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
        No version history yet.
      </p>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Timeline line */}
      <div
        className="absolute left-3 top-0 bottom-0 w-px"
        style={{ backgroundColor: "var(--border)" }}
      />

      <div className="space-y-0">
        {visible.map((version, idx) => {
          const isExpanded = expanded.has(version.id);
          const isLatest = idx === 0;

          return (
            <div key={version.id} className="relative pl-8 pb-4">
              {/* Timeline dot */}
              <div
                className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2"
                style={{
                  borderColor: isLatest ? "rgb(139,92,246)" : "var(--border)",
                  backgroundColor: isLatest ? "rgb(139,92,246)" : "var(--card)",
                }}
              />

              {/* Version header */}
              <button
                onClick={() => toggle(version.id)}
                className="flex w-full items-center gap-2 text-left group"
              >
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {isExpanded ? <ChevronDown className="inline h-3 w-3" /> : <ChevronRight className="inline h-3 w-3" />}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    isLatest ? "text-foreground" : "",
                  )}
                  style={isLatest ? { color: "rgb(139,92,246)" } : { color: "var(--foreground)" }}
                >
                  v{version.version}
                </span>
                {version.change_summary && (
                  <span
                    className="truncate text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {version.change_summary}
                  </span>
                )}
                <span
                  className="ml-auto shrink-0 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                  title={formatDateTime(version.created_at)}
                >
                  {formatRelative(version.created_at)}
                </span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="mt-2 space-y-2">
                  {version.changed_by && (
                    <div className="flex items-center gap-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                      <User className="h-3 w-3" />
                      <span>{version.changed_by}</span>
                    </div>
                  )}
                  <pre
                    className="overflow-auto rounded-md p-3 text-xs"
                    style={{
                      backgroundColor: "var(--muted)",
                      maxHeight: "200px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {version.content}
                  </pre>
                  {onRestore && (
                    <button
                      onClick={() => onRestore(version)}
                      className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Restore this version
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show more */}
      {versions.length > maxVisible && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="ml-8 text-xs font-medium"
          style={{ color: "rgb(139,92,246)" }}
        >
          Show {versions.length - maxVisible} more versions
        </button>
      )}
    </div>
  );
}
