"use client";

import { cn } from "@/lib/utils";

interface VariablePillProps {
  name: string;
  className?: string;
}

export function VariablePill({ name, className }: VariablePillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-mono font-medium",
        className,
      )}
      style={{
        backgroundColor: "rgba(139,92,246,0.1)",
        color: "rgb(124,58,237)",
        border: "1px solid rgba(139,92,246,0.2)",
      }}
    >
      {`{{${name}}}`}
    </span>
  );
}

const VARIABLE_REGEX = /\{\{(\w+(?:\.\w+)*)\}\}/g;

export function extractVariables(content: string): string[] {
  const matches = content.matchAll(VARIABLE_REGEX);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

interface VariablePillListProps {
  content: string;
  className?: string;
}

export function VariablePillList({ content, className }: VariablePillListProps) {
  const vars = extractVariables(content);
  if (vars.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {vars.map((v) => (
        <VariablePill key={v} name={v} />
      ))}
    </div>
  );
}
