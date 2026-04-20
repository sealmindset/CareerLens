"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface BreadcrumbContextValue {
  overrides: BreadcrumbItem[] | null;
  setOverrides: (items: BreadcrumbItem[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  overrides: null,
  setOverrides: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<BreadcrumbItem[] | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ overrides, setOverrides }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbs() {
  const { setOverrides } = useContext(BreadcrumbContext);
  const set = useCallback(
    (items: BreadcrumbItem[]) => setOverrides(items),
    [setOverrides],
  );
  const clear = useCallback(() => setOverrides(null), [setOverrides]);
  return useMemo(() => ({ set, clear }), [set, clear]);
}

const segmentLabels: Record<string, string> = {
  "command-center": "Command Center",
  profile: "My Profile",
  resumes: "Resumes",

  agents: "Application Studio",
  stories: "Story Bank",
  "interview-questions": "Interview Questions",
  prep: "Meeting Prep",
  settings: "Settings",
  admin: "Admin",
  users: "Users",
  roles: "Roles",
  prompts: "Prompts",
};

function formatSegment(segment: string): string {
  if (segmentLabels[segment]) return segmentLabels[segment];
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const { overrides } = useContext(BreadcrumbContext);

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 && !overrides) return null;

  const crumbs: { label: string; href?: string; onClick?: () => void; isLast: boolean }[] =
    overrides
      ? overrides.map((item, i) => ({
          ...item,
          isLast: i === overrides.length - 1,
        }))
      : segments.map((segment, index) => {
          const href = "/" + segments.slice(0, index + 1).join("/");
          const isLast = index === segments.length - 1;
          const isId =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              segment,
            ) || /^\d+$/.test(segment);
          const label = isId ? segment.slice(0, 8) + "..." : formatSegment(segment);
          return { href, label, isLast };
        });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <Link
        href="/command-center"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <Home className="h-4 w-4" />
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.label} className="flex items-center">
          <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-muted-foreground/50" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : crumb.onClick ? (
            <button
              onClick={crumb.onClick}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
              )}
            >
              {crumb.label}
            </button>
          ) : crumb.href ? (
            <Link
              href={crumb.href}
              className={cn(
                "text-muted-foreground transition-colors hover:text-foreground",
              )}
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-muted-foreground">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
