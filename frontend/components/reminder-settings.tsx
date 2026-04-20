"use client";

import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReminderRule {
  offset_minutes: number;
  channel: string;
  sent?: boolean;
}

const PRESETS: { label: string; offset_minutes: number }[] = [
  { label: "1 week", offset_minutes: 10080 },
  { label: "3 days", offset_minutes: 4320 },
  { label: "1 day", offset_minutes: 1440 },
  { label: "2 hours", offset_minutes: 120 },
  { label: "1 hour", offset_minutes: 60 },
  { label: "30 min", offset_minutes: 30 },
  { label: "15 min", offset_minutes: 15 },
];

export const DEFAULT_REMINDERS: ReminderRule[] = [
  { offset_minutes: 1440, channel: "in_app" },
  { offset_minutes: 120, channel: "in_app" },
  { offset_minutes: 30, channel: "in_app" },
];

function formatOffset(minutes: number): string {
  if (minutes >= 10080) return `${Math.round(minutes / 10080)} week`;
  if (minutes >= 1440) {
    const d = Math.round(minutes / 1440);
    return `${d} day${d > 1 ? "s" : ""}`;
  }
  if (minutes >= 60) {
    const h = Math.round(minutes / 60);
    return `${h} hour${h > 1 ? "s" : ""}`;
  }
  return `${minutes} min`;
}

interface Props {
  value: ReminderRule[];
  onChange: (reminders: ReminderRule[]) => void;
}

export function ReminderSettings({ value, onChange }: Props) {
  const activeOffsets = new Set(value.map((r) => r.offset_minutes));
  const available = PRESETS.filter((p) => !activeOffsets.has(p.offset_minutes));

  const remove = (offset: number) =>
    onChange(value.filter((r) => r.offset_minutes !== offset));

  const add = (offset: number) =>
    onChange(
      [...value, { offset_minutes: offset, channel: "in_app" }].sort(
        (a, b) => b.offset_minutes - a.offset_minutes,
      ),
    );

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">
        Reminders
      </label>
      <div className="flex flex-wrap gap-1.5">
        {value
          .sort((a, b) => b.offset_minutes - a.offset_minutes)
          .map((r) => (
            <span
              key={r.offset_minutes}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                "bg-blue-50 border-blue-200 text-blue-700",
                "dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300",
              )}
            >
              {formatOffset(r.offset_minutes)} before
              <button
                type="button"
                onClick={() => remove(r.offset_minutes)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        {available.length > 0 && (
          <div className="relative group">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
            <div className="absolute left-0 top-full z-10 mt-1 hidden rounded-md border bg-popover p-1 shadow-md group-hover:block">
              {available.map((preset) => (
                <button
                  key={preset.offset_minutes}
                  type="button"
                  onClick={() => add(preset.offset_minutes)}
                  className="block w-full rounded px-3 py-1 text-left text-xs hover:bg-accent"
                >
                  {preset.label} before
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
