"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  Calendar,
  Check,
  Circle,
  Clock,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import { apiPatch, apiDelete } from "@/lib/api";
import type { Task } from "@/lib/types";

const PRIORITY_CONFIG: Record<string, { color: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  urgent: { color: "text-red-600 dark:text-red-400", icon: AlertCircle, label: "Urgent" },
  important: { color: "text-orange-600 dark:text-orange-400", icon: ArrowUp, label: "Important" },
  normal: { color: "text-blue-600 dark:text-blue-400", icon: Minus, label: "Normal" },
  low: { color: "text-gray-500 dark:text-gray-400", icon: Circle, label: "Low" },
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400" },
  in_progress: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  done: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  dismissed: { bg: "bg-gray-100 dark:bg-gray-800/30", text: "text-gray-500 dark:text-gray-400" },
};

function formatDueDate(due: string | null): { text: string; urgent: boolean } {
  if (!due) return { text: "", urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(due + "T00:00:00");
  const diff = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { text: "Due today", urgent: true };
  if (diff === 1) return { text: "Due tomorrow", urgent: false };
  if (diff <= 7) return { text: `Due in ${diff}d`, urgent: false };
  return {
    text: dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    urgent: false,
  };
}

interface TaskListProps {
  tasks: Task[];
  onTaskUpdated: () => void;
  showCompleted?: boolean;
}

export function TaskList({ tasks, onTaskUpdated, showCompleted = false }: TaskListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const visibleTasks = showCompleted
    ? tasks
    : tasks.filter((t) => t.status !== "done" && t.status !== "dismissed");

  const handleComplete = async (taskId: string) => {
    setLoadingId(taskId);
    try {
      await apiPatch(`/tasks/${taskId}/complete`, {});
      onTaskUpdated();
    } catch {
      // ignore
    } finally {
      setLoadingId(null);
    }
  };

  const handleDismiss = async (taskId: string) => {
    setLoadingId(taskId);
    try {
      await apiPatch(`/tasks/${taskId}/dismiss`, {});
      onTaskUpdated();
    } catch {
      // ignore
    } finally {
      setLoadingId(null);
    }
  };

  if (visibleTasks.length === 0) {
    return (
      <div className="py-8 text-center">
        <Check className="mx-auto h-8 w-8 text-green-500/50" />
        <p className="mt-2 text-sm text-muted-foreground">All caught up!</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {visibleTasks.map((task) => {
        const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
        const PriorityIcon = priority.icon;
        const due = formatDueDate(task.due_date);
        const statusBadge = STATUS_BADGE[task.status] || STATUS_BADGE.pending;
        const isLoading = loadingId === task.id;
        const isDone = task.status === "done" || task.status === "dismissed";

        return (
          <div
            key={task.id}
            className={`group flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/20 ${
              isDone ? "opacity-50" : ""
            }`}
          >
            {/* Checkbox */}
            <button
              onClick={() => handleComplete(task.id)}
              disabled={isLoading || isDone}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isDone
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-muted-foreground/30 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/30"
              }`}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isDone ? (
                <Check className="h-3 w-3" />
              ) : null}
            </button>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <PriorityIcon className={`h-3.5 w-3.5 shrink-0 ${priority.color}`} />
                <span
                  className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}
                >
                  {task.title}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {due.text && (
                  <span
                    className={`flex items-center gap-1 ${
                      due.urgent ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
                    }`}
                  >
                    {due.urgent ? <AlertCircle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                    {due.text}
                  </span>
                )}
                {task.due_reason && (
                  <span className="text-muted-foreground/70 truncate max-w-[200px]" title={task.due_reason}>
                    {task.due_reason}
                  </span>
                )}
                {task.source_type !== "manual" && (
                  <span className={`rounded-full px-1.5 py-0.5 ${statusBadge.bg} ${statusBadge.text}`}>
                    {task.source_type}
                  </span>
                )}
              </div>
            </div>

            {/* Dismiss button */}
            {!isDone && (
              <button
                onClick={() => handleDismiss(task.id)}
                disabled={isLoading}
                className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:bg-accent hover:text-muted-foreground group-hover:opacity-100"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
