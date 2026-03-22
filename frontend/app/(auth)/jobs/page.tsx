"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable } from "@/components/data-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { formatDate } from "@/lib/utils";
import type { JobListing, JobScrapeResult } from "@/lib/types";
import {
  Plus,
  X,
  Loader2,
  Search,
  Zap,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Download,
  Globe,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  FormInput,
  Mail,
  ArrowUpRight,
  KeyRound,
  HelpCircle,
  Rocket,
} from "lucide-react";

const statusColors: Record<string, { bg: string; text: string }> = {
  new: { bg: "rgba(59,130,246,0.1)", text: "rgb(59,130,246)" },
  analyzing: { bg: "rgba(234,179,8,0.1)", text: "rgb(161,98,7)" },
  analyzed: { bg: "rgba(16,185,129,0.1)", text: "rgb(5,150,105)" },
  applied: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)" },
  archived: { bg: "rgba(107,114,128,0.1)", text: "rgb(107,114,128)" },
};

const methodIcons: Record<string, typeof MessageSquare> = {
  chatbot: MessageSquare,
  form: FormInput,
  email: Mail,
  redirect: ArrowUpRight,
  api_portal: KeyRound,
  unknown: HelpCircle,
};

const methodLabels: Record<string, string> = {
  chatbot: "Chatbot",
  form: "Web Form",
  email: "Email",
  redirect: "Redirect",
  api_portal: "ATS Portal",
  unknown: "Unknown",
};

const methodColors: Record<string, { bg: string; text: string }> = {
  chatbot: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)" },
  form: { bg: "rgba(59,130,246,0.1)", text: "rgb(37,99,235)" },
  email: { bg: "rgba(16,185,129,0.1)", text: "rgb(5,150,105)" },
  redirect: { bg: "rgba(234,179,8,0.1)", text: "rgb(161,98,7)" },
  api_portal: { bg: "rgba(239,68,68,0.1)", text: "rgb(220,38,38)" },
  unknown: { bg: "rgba(107,114,128,0.1)", text: "rgb(107,114,128)" },
};

const statusOptions = [
  { label: "New", value: "new" },
  { label: "Analyzing", value: "analyzing" },
  { label: "Analyzed", value: "analyzed" },
  { label: "Applied", value: "applied" },
  { label: "Archived", value: "archived" },
];

export default function JobsPage() {
  const router = useRouter();
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
  const [addDescription, setAddDescription] = useState("");
  const [addLocation, setAddLocation] = useState("");
  const [addSource, setAddSource] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Scrape state
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(false);
  const [scrapeError, setScrapeError] = useState("");

  // Import from URL
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

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

  const scrapeUrl = useCallback(async (url: string) => {
    if (!url.startsWith("http")) return;
    setScraping(true);
    setScraped(false);
    setScrapeError("");
    try {
      const result = await apiPost<JobScrapeResult>("/jobs/scrape", { url });
      if (result.error) {
        setScrapeError(result.error);
        return;
      }
      if (result.title) setAddTitle(result.title);
      if (result.company) setAddCompany(result.company);
      if (result.description) setAddDescription(result.description);
      if (result.location) setAddLocation(result.location);
      if (result.source) setAddSource(result.source);
      setScraped(true);
    } catch (err) {
      setScrapeError("Could not scrape this URL. You can still fill in the details manually.");
      console.error("Scrape failed:", err);
    } finally {
      setScraping(false);
    }
  }, []);

  const handleUrlChange = useCallback((value: string) => {
    setAddUrl(value);
    setScraped(false);
    setScrapeError("");
  }, []);

  const handleUrlBlur = useCallback(() => {
    if (addUrl.startsWith("http") && !scraped && !scraping && !addTitle) {
      scrapeUrl(addUrl);
    }
  }, [addUrl, scraped, scraping, addTitle, scrapeUrl]);

  const handleUrlPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    if (pasted.startsWith("http")) {
      // Let React update the input value first, then scrape
      setTimeout(() => scrapeUrl(pasted), 100);
    }
  }, [scrapeUrl]);

  const addJob = async () => {
    setAddSaving(true);
    try {
      await apiPost("/jobs", {
        url: addUrl,
        title: addTitle || null,
        company: addCompany || null,
        description: addDescription || null,
        location: addLocation || null,
        source: addSource || "manual",
      });
      setShowAddModal(false);
      resetAddForm();
      await fetchJobs();
    } catch (err) {
      console.error("Failed to add job:", err);
    } finally {
      setAddSaving(false);
    }
  };

  const importFromUrl = async () => {
    setImporting(true);
    setImportError("");
    try {
      await apiPost("/jobs/import", { url: importUrl });
      setShowImportModal(false);
      setImportUrl("");
      await fetchJobs();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setImportError(message);
      console.error("Import failed:", err);
    } finally {
      setImporting(false);
    }
  };

  const resetAddForm = () => {
    setAddUrl("");
    setAddTitle("");
    setAddCompany("");
    setAddDescription("");
    setAddLocation("");
    setAddSource("");
    setScraped(false);
    setScrapeError("");
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

  const openInStudio = (job: JobListing) => {
    router.push(`/agents?job=${job.id}`);
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
        accessorKey: "application_method",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Apply Method" />
        ),
        cell: ({ row }) => {
          const method = row.getValue("application_method") as string | null;
          if (!method) {
            return <span style={{ color: "var(--muted-foreground)" }}>--</span>;
          }
          const Icon = methodIcons[method] || HelpCircle;
          const colors = methodColors[method] || methodColors.unknown;
          const label = methodLabels[method] || method;
          const platform = row.original.application_platform;
          return (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: colors.bg, color: colors.text }}
              title={platform ? `${label} (${platform})` : label}
            >
              <Icon className="h-3 w-3" />
              {label}
            </span>
          );
        },
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
                  onClick={() => openInStudio(job)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                  title="Open in Application Studio"
                >
                  <Rocket className="h-3 w-3" />
                  Studio
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              style={{ borderColor: "var(--border)" }}
            >
              <Download className="h-4 w-4" />
              Import from URL
            </button>
            <button
              onClick={() => { resetAddForm(); setShowAddModal(true); }}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus className="h-4 w-4" />
              Add Job
            </button>
          </div>
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
                <div className="relative">
                  <input
                    type="url"
                    value={addUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    onBlur={handleUrlBlur}
                    onPaste={handleUrlPaste}
                    placeholder="Paste a job listing URL to auto-fill details..."
                    className="w-full rounded-md border px-3 py-2 pr-10 text-sm outline-none focus:ring-1 focus:ring-ring"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                    }}
                  />
                  {scraping && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--primary)" }} />
                    </div>
                  )}
                  {scraped && !scraping && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle className="h-4 w-4" style={{ color: "#10b981" }} />
                    </div>
                  )}
                </div>
                {scraping && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                    Scraping job details... this may take a moment.
                  </p>
                )}
                {scrapeError && (
                  <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}>
                    <AlertCircle className="h-3 w-3" />
                    {scrapeError}
                  </p>
                )}
                {scraped && !scraping && (
                  <p className="text-xs mt-1" style={{ color: "#10b981" }}>
                    Job details auto-filled. Review and edit below.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder={scraping ? "Extracting..." : ""}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Company</label>
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
                  <label className="block text-sm font-medium mb-1">Location</label>
                  <input
                    type="text"
                    value={addLocation}
                    onChange={(e) => setAddLocation(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Source</label>
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
              {addDescription && (
                <div>
                  <label className="block text-sm font-medium mb-1">Description (scraped)</label>
                  <textarea
                    value={addDescription}
                    onChange={(e) => setAddDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-y"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                    }}
                  />
                </div>
              )}
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
                  disabled={!addUrl.trim() || addSaving || scraping}
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

      {/* Import from URL Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowImportModal(false)}
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
              <h2 className="text-lg font-semibold">Import from URL</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="rounded p-1 transition-colors hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
              Paste a job listing URL and we will automatically scrape the details and create the listing for you.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Job URL</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Globe className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                  </span>
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => { setImportUrl(e.target.value); setImportError(""); }}
                    placeholder="https://www.linkedin.com/jobs/view/..."
                    className="w-full rounded-md border pl-10 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                    }}
                  />
                </div>
              </div>
              {importError && (
                <p className="text-xs flex items-center gap-1" style={{ color: "#ef4444" }}>
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {importError}
                </p>
              )}
              {importing && (
                <div className="flex items-center gap-2 rounded-md p-3 text-sm"
                  style={{ backgroundColor: "var(--muted)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--primary)" }} />
                  <span>Scraping and importing... this may take 15-30 seconds.</span>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  style={{ borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={importFromUrl}
                  disabled={!importUrl.trim() || !importUrl.startsWith("http") || importing}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Import
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
          {expandedJob.application_method && (
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Application Method</h3>
              <div className="flex items-center gap-2">
                {(() => {
                  const m = expandedJob.application_method;
                  const Icon = methodIcons[m] || HelpCircle;
                  const colors = methodColors[m] || methodColors.unknown;
                  const label = methodLabels[m] || m;
                  return (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </span>
                  );
                })()}
                {expandedJob.application_platform && (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    via {expandedJob.application_platform}
                  </span>
                )}
              </div>
              {expandedJob.application_method_details && (
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {expandedJob.application_method_details}
                </p>
              )}
            </div>
          )}
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
