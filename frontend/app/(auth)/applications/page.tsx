"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable } from "@/components/data-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { formatDate } from "@/lib/utils";
import type { Application, JobListing } from "@/lib/types";
import { Plus, X, Loader2, Save } from "lucide-react";

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: "rgba(107,114,128,0.1)", text: "rgb(107,114,128)", label: "Draft" },
  tailoring: { bg: "rgba(59,130,246,0.1)", text: "rgb(59,130,246)", label: "Tailoring" },
  ready_to_review: { bg: "rgba(234,179,8,0.1)", text: "rgb(161,98,7)", label: "Ready to Review" },
  submitted: { bg: "rgba(16,185,129,0.1)", text: "rgb(5,150,105)", label: "Submitted" },
  interviewing: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)", label: "Interviewing" },
  offer: { bg: "rgba(16,185,129,0.15)", text: "rgb(5,150,105)", label: "Offer" },
  rejected: { bg: "rgba(239,68,68,0.1)", text: "rgb(220,38,38)", label: "Rejected" },
  withdrawn: { bg: "rgba(107,114,128,0.1)", text: "rgb(107,114,128)", label: "Withdrawn" },
};

const statusOptions = Object.entries(statusConfig).map(([value, cfg]) => ({
  label: cfg.label,
  value,
}));

const allStatuses = Object.keys(statusConfig);

export default function ApplicationsPage() {
  const { hasPermission } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Detail editing
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);

  // Add form
  const [addJobId, setAddJobId] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const canCreate = hasPermission("applications", "create");
  const canEdit = hasPermission("applications", "edit");

  const fetchData = useCallback(async () => {
    try {
      const [appsData, jobsData] = await Promise.all([
        apiGet<Application[]>("/applications"),
        apiGet<JobListing[]>("/jobs"),
      ]);
      setApplications(appsData);
      setJobs(jobsData);
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openDetail = (app: Application) => {
    setSelectedApp(app);
    setEditNotes(app.notes || "");
    setEditStatus(app.status);
  };

  const saveDetail = async () => {
    if (!selectedApp) return;
    setDetailSaving(true);
    try {
      await apiPut(`/applications/${selectedApp.id}`, {
        status: editStatus,
        notes: editNotes || null,
      });
      setSelectedApp(null);
      await fetchData();
    } catch (err) {
      console.error("Failed to update application:", err);
    } finally {
      setDetailSaving(false);
    }
  };

  const addApplication = async () => {
    setAddSaving(true);
    try {
      await apiPost("/applications", {
        job_listing_id: addJobId,
        status: "draft",
      });
      setShowAddModal(false);
      setAddJobId("");
      await fetchData();
    } catch (err) {
      console.error("Failed to create application:", err);
    } finally {
      setAddSaving(false);
    }
  };

  // Jobs that have been analyzed but don't have an application yet
  const availableJobs = useMemo(() => {
    const appliedJobIds = new Set(applications.map((a) => a.job_listing_id));
    return jobs.filter((j) => j.status === "analyzed" && !appliedJobIds.has(j.id));
  }, [jobs, applications]);

  const columns = useMemo<ColumnDef<Application, unknown>[]>(
    () => [
      {
        accessorKey: "job_title",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Job Title" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("job_title") || "Untitled"}</span>
        ),
      },
      {
        accessorKey: "job_company",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Company" />
        ),
        cell: ({ row }) => row.getValue("job_company") || "--",
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          const cfg = statusConfig[status] || statusConfig.draft;
          return (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: cfg.bg, color: cfg.text }}
            >
              {cfg.label}
            </span>
          );
        },
        filterFn: "arrIncludes",
      },
      {
        accessorKey: "submission_mode",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Submission Mode" />
        ),
        cell: ({ row }) => {
          const mode = row.getValue("submission_mode") as string;
          return (
            <span className="text-sm capitalize">{mode || "--"}</span>
          );
        },
      },
      {
        accessorKey: "submitted_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Submitted At" />
        ),
        cell: ({ row }) => {
          const val = row.getValue("submitted_at") as string | null;
          return val ? formatDate(val) : "--";
        },
      },
      {
        accessorKey: "follow_up_date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Follow-Up Date" />
        ),
        cell: ({ row }) => {
          const val = row.getValue("follow_up_date") as string | null;
          return val ? formatDate(val) : "--";
        },
      },
      {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ row }) => {
          const notes = row.getValue("notes") as string | null;
          if (!notes) return <span style={{ color: "var(--muted-foreground)" }}>--</span>;
          return (
            <span className="text-sm truncate block max-w-[200px]">
              {notes}
            </span>
          );
        },
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Track your job application pipeline from draft to offer.
          </p>
        </div>
        {canCreate && availableJobs.length > 0 && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <Plus className="h-4 w-4" />
            Add Application
          </button>
        )}
      </div>

      {/* Add Application Modal */}
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
              <h2 className="text-lg font-semibold">Add Application</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded p-1 transition-colors hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Select Job</label>
                <select
                  value={addJobId}
                  onChange={(e) => setAddJobId(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  <option value="">Choose a job...</option>
                  {availableJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title} at {job.company}
                    </option>
                  ))}
                </select>
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
                  onClick={addApplication}
                  disabled={!addJobId || addSaving}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  {addSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Application Detail Modal */}
      {selectedApp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedApp(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border p-6 shadow-lg"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {selectedApp.job_title || "Application"}
                </h2>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {selectedApp.job_company || "Unknown company"}
                </p>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="rounded p-1 transition-colors hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  {allStatuses.map((s) => (
                    <option key={s} value={s}>
                      {statusConfig[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  disabled={!canEdit}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              {selectedApp.tailored_resume && (
                <div>
                  <label className="block text-sm font-medium mb-1">Tailored Resume</label>
                  <div
                    className="rounded-md border p-3 text-sm max-h-40 overflow-y-auto whitespace-pre-wrap"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {selectedApp.tailored_resume}
                  </div>
                </div>
              )}
              {selectedApp.cover_letter && (
                <div>
                  <label className="block text-sm font-medium mb-1">Cover Letter</label>
                  <div
                    className="rounded-md border p-3 text-sm max-h-40 overflow-y-auto whitespace-pre-wrap"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {selectedApp.cover_letter}
                  </div>
                </div>
              )}
              {canEdit && (
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setSelectedApp(null)}
                    className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveDetail}
                    disabled={detailSaving}
                    className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    {detailSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Applications DataTable */}
      <DataTable
        columns={columns}
        data={applications}
        searchKey="job_title"
        searchPlaceholder="Search applications..."
        filterableColumns={[
          { id: "status", title: "Status", options: statusOptions },
        ]}
        storageKey="applications-table"
        onRowClick={openDetail}
      />
    </div>
  );
}
