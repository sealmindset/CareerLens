"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable } from "@/components/data-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { formatDate } from "@/lib/utils";
import type { JobListing } from "@/lib/types";
import {
  Plus,
  X,
  Loader2,
  Search,
  Zap,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: "rgba(59,130,246,0.1)", text: "rgb(59,130,246)" },
  analyzing: { bg: "rgba(234,179,8,0.1)", text: "rgb(161,98,7)" },
  analyzed: { bg: "rgba(16,185,129,0.1)", text: "rgb(5,150,105)" },
  applied: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)" },
  archived: { bg: "rgba(107,114,128,0.1)", text: "rgb(107,114,128)" },
};

const statusOptions = [
  { label: "New", value: "new" },
  { label: "Analyzing", value: "analyzing" },
  { label: "Analyzed", value: "analyzed" },
  { label: "Applied", value: "applied" },
  { label: "Archived", value: "archived" },
];

export default function JobsPage() {
  const { hasPermission } = useAuth();
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  // Add job form
  const [addUrl, setAddUrl] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addCompany, setAddCompany] = useState("");
  const [addSource, setAddSource] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const canCreate = hasPermission("jobs", "create");

  const fetchJobs = useCallback(async () => {
    try {
      const data = await apiGet<JobListing[]>("/jobs");
      setJobs(data);
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const addJob = async () => {
    setAddSaving(true);
    try {
      await apiPost("/jobs", {
        url: addUrl,
        title: addTitle || null,
        company: addCompany || null,
        source: addSource || "manual",
      });
      setShowAddModal(false);
      setAddUrl("");
      setAddTitle("");
      setAddCompany("");
      setAddSource("");
      await fetchJobs();
    } catch (err) {
      console.error("Failed to add job:", err);
    } finally {
      setAddSaving(false);
    }
  };

  const analyzeJob = async (id: string) => {
    setAnalyzingIds((prev) => new Set(prev).add(id));
    try {
      await apiPost(`/jobs/${id}/analyze`);
      await fetchJobs();
    } catch (err) {
      console.error("Failed to analyze job:", err);
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const applyToJob = async (job: JobListing) => {
    try {
      await apiPost("/applications", {
        job_listing_id: job.id,
        status: "draft",
      });
      await fetchJobs();
    } catch (err) {
      console.error("Failed to create application:", err);
    }
  };

  const columns = useMemo<ColumnDef<JobListing, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Title" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedId(expandedId === row.original.id ? null : row.original.id);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {expandedId === row.original.id ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            <span className="font-medium">{row.getValue("title")}</span>
          </div>
        ),
      },
      {
        accessorKey: "company",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Company" />
        ),
      },
      {
        accessorKey: "source",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Source" />
        ),
        filterFn: "arrIncludes",
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          const colors = statusColors[status] || statusColors.new;
          return (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {status}
            </span>
          );
        },
        filterFn: "arrIncludes",
      },
      {
        accessorKey: "match_score",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Match Score" />
        ),
        cell: ({ row }) => {
          const score = row.getValue("match_score") as number | null;
          if (score === null || score === undefined) {
            return <span style={{ color: "var(--muted-foreground)" }}>--</span>;
          }
          const pct = Math.round(score);
          const barColor =
            pct >= 75 ? "#10b981" : pct >= 50 ? "#eab308" : "#ef4444";
          return (
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-16 rounded-full"
                style={{ backgroundColor: "var(--muted)" }}
              >
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
              </div>
              <span className="text-xs font-medium">{pct}%</span>
            </div>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => formatDate(row.getValue("created_at")),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const job = row.original;
          const isAnalyzing = analyzingIds.has(job.id);
          return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => analyzeJob(job.id)}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                title="Analyze job"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                Analyze
              </button>
              {job.status === "analyzed" && (
                <button
                  onClick={() => applyToJob(job)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent"
                  title="Create application"
                >
                  <FileText className="h-3 w-3" />
                  Apply
                </button>
              )}
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md p-1 transition-colors hover:bg-accent"
                  title="Open listing"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          );
        },
      },
    ],
    [expandedId, analyzingIds],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  const expandedJob = expandedId ? jobs.find((j) => j.id === expandedId) : null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Listings</h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Track and manage job listings you are interested in.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <Plus className="h-4 w-4" />
            Add Job
          </button>
        )}
      </div>

      {/* Add Job Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border p-6 shadow-lg"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Job Listing</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded p-1 transition-colors hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Job URL *</label>
                <input
                  type="url"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company (optional)</label>
                <input
                  type="text"
                  value={addCompany}
                  onChange={(e) => setAddCompany(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Source (optional)</label>
                <input
                  type="text"
                  value={addSource}
                  onChange={(e) => setAddSource(e.target.value)}
                  placeholder="e.g. LinkedIn, Indeed"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  style={{ borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={addJob}
                  disabled={!addUrl.trim() || addSaving}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  {addSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Job
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expanded job detail */}
      {expandedJob && (
        <div
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--card-foreground)",
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{expandedJob.title}</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {expandedJob.company}
                {expandedJob.location && ` -- ${expandedJob.location}`}
                {expandedJob.salary_range && ` -- ${expandedJob.salary_range}`}
              </p>
            </div>
            <button
              onClick={() => setExpandedId(null)}
              className="rounded p-1 transition-colors hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {expandedJob.description && (
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Description</h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted-foreground)" }}>
                {expandedJob.description}
              </p>
            </div>
          )}
          {expandedJob.match_analysis && (
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Match Analysis</h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted-foreground)" }}>
                {expandedJob.match_analysis}
              </p>
            </div>
          )}
          {expandedJob.requirements && expandedJob.requirements.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Requirements</h3>
              <ul className="space-y-2">
                {expandedJob.requirements.map((req) => (
                  <li
                    key={req.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span
                      className="mt-0.5 inline-block h-4 w-4 rounded-full text-center text-xs leading-4 font-medium shrink-0"
                      style={{
                        backgroundColor:
                          req.is_met === true
                            ? "rgba(16,185,129,0.2)"
                            : req.is_met === false
                            ? "rgba(239,68,68,0.2)"
                            : "rgba(107,114,128,0.2)",
                        color:
                          req.is_met === true
                            ? "#059669"
                            : req.is_met === false
                            ? "#dc2626"
                            : "#6b7280",
                      }}
                    >
                      {req.is_met === true ? "+" : req.is_met === false ? "-" : "?"}
                    </span>
                    <div>
                      <span>{req.requirement_text}</span>
                      {req.gap_notes && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          {req.gap_notes}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Jobs DataTable */}
      <DataTable
        columns={columns}
        data={jobs}
        searchKey="title"
        searchPlaceholder="Search jobs..."
        filterableColumns={[
          { id: "status", title: "Status", options: statusOptions },
        ]}
        storageKey="jobs-table"
      />
    </div>
  );
}
