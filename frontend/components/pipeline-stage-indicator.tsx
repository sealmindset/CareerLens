"use client";

import { cn } from "@/lib/utils";

export interface PipelineStage {
  key: string;
  label: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: "tbat", label: "TBAT" },
  { key: "applied", label: "Applied" },
  { key: "recruiter_interview", label: "Recruiter" },
  { key: "hr_interview", label: "HR" },
  { key: "technical_interview", label: "Technical" },
  { key: "hiring_manager_interview", label: "Hiring Mgr" },
  { key: "panel_interview", label: "Panel" },
  { key: "offer", label: "Offer" },
  { key: "negotiation", label: "Negotiation" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
  { key: "withdrawn", label: "Withdrawn" },
];

interface Props {
  currentStage: string;
  onStageChange?: (stage: string) => void;
  readonly?: boolean;
  compact?: boolean;
}

const terminalStages = new Set(["accepted", "rejected", "withdrawn"]);

export function PipelineStageIndicator({
  currentStage,
  onStageChange,
  readonly = false,
  compact = false,
}: Props) {
  const currentIdx = PIPELINE_STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isCurrent = stage.key === currentStage;
        const isPast = idx < currentIdx && !terminalStages.has(currentStage);
        const isTerminal = terminalStages.has(stage.key);
        const isTerminalActive = isCurrent && isTerminal;

        return (
          <button
            key={stage.key}
            type="button"
            disabled={readonly && !onStageChange}
            onClick={() => !readonly && onStageChange?.(stage.key)}
            className={cn(
              "relative flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-all",
              compact && "px-1.5 py-0 text-[10px]",
              isCurrent && !isTerminal &&
                "border-blue-500 bg-blue-500 text-white",
              isTerminalActive && stage.key === "accepted" &&
                "border-green-500 bg-green-500 text-white",
              isTerminalActive && stage.key === "rejected" &&
                "border-red-500 bg-red-500 text-white",
              isTerminalActive && stage.key === "withdrawn" &&
                "border-yellow-500 bg-yellow-500 text-white",
              isPast &&
                "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
              !isCurrent && !isPast &&
                "border-muted bg-muted/30 text-muted-foreground",
              !readonly && onStageChange && "cursor-pointer hover:ring-2 hover:ring-blue-400/50",
              readonly && "cursor-default",
            )}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                isCurrent && !isTerminal && "bg-white",
                isTerminalActive && "bg-white",
                isPast && "bg-blue-500",
                !isCurrent && !isPast && "bg-muted-foreground/30",
              )}
            />
            {stage.label}
          </button>
        );
      })}
    </div>
  );
}
