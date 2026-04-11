"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type {
  ResumeVariant,
  ResumeVariantDetail,
  ResumeVariantVersion,
  ResumeUploadExtraction,
  VariantDiffResult,
  VariantStatsResponse,
} from "@/lib/types";
import {
  Plus,
  Upload,
  FileText,
  Star,
  StarOff,
  Pencil,
  Trash2,
  History,
  RotateCcw,
  GitCompareArrows,
  X,
  Save,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  BarChart3,
  TrendingUp,
} from "lucide-react";

export default function ResumesPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("resumes", "edit");

  const [variants, setVariants] = useState<ResumeVariant[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createTargetRoles, setCreateTargetRoles] = useState("");
  const [createKeywords, setCreateKeywords] = useState("");
  const [createGuidance, setCreateGuidance] = useState("");
  const [createIsDefault, setCreateIsDefault] = useState(false);
  const [creating, setCreating] = useState(false);

  // Detail/edit modal
  const [selectedVariant, setSelectedVariant] = useState<ResumeVariantDetail | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTargetRoles, setEditTargetRoles] = useState("");
  const [editKeywords, setEditKeywords] = useState("");
  const [editGuidance, setEditGuidance] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  // Upload flow
  const [uploadVariantId, setUploadVariantId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extraction, setExtraction] = useState<ResumeUploadExtraction | null>(null);
  const [reviewData, setReviewData] = useState<ResumeUploadExtraction | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [savingUpload, setSavingUpload] = useState(false);

  // Version history
  const [showVersions, setShowVersions] = useState<string | null>(null);
  const [versions, setVersions] = useState<ResumeVariantVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  // Diff viewer
  const [diffVariantId, setDiffVariantId] = useState<string | null>(null);
  const [diffVersionA, setDiffVersionA] = useState<number>(0);
  const [diffVersionB, setDiffVersionB] = useState<number>(0);
  const [diffResult, setDiffResult] = useState<VariantDiffResult | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Content viewer
  const [expandedContent, setExpandedContent] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<VariantStatsResponse | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);

  const loadVariants = useCallback(async () => {
    try {
      const data = await apiGet<ResumeVariant[]>("/resume-variants");
      setVariants(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await apiGet<VariantStatsResponse>("/resume-variants/stats");
      setStats(data);
      setShowStats(true);
    } catch {
      // ignore
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await apiPost("/resume-variants", {
        name: createName.trim(),
        description: createDesc.trim() || null,
        target_roles: createTargetRoles.trim() || null,
        matching_keywords: createKeywords.trim()
          ? createKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : null,
        usage_guidance: createGuidance.trim() || null,
        is_default: createIsDefault,
      });
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      setCreateTargetRoles("");
      setCreateKeywords("");
      setCreateGuidance("");
      setCreateIsDefault(false);
      await loadVariants();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this resume variant and all its versions?")) return;
    await apiDelete(`/resume-variants/${id}`);
    await loadVariants();
  };

  const handleSetDefault = async (id: string) => {
    await apiPut(`/resume-variants/${id}`, { is_default: true });
    await loadVariants();
  };

  const openDetail = async (id: string) => {
    try {
      const detail = await apiGet<ResumeVariantDetail>(`/resume-variants/${id}`);
      setSelectedVariant(detail);
      setEditName(detail.name);
      setEditDesc(detail.description || "");
      setEditTargetRoles(detail.target_roles || "");
      setEditKeywords((detail.matching_keywords || []).join(", "));
      setEditGuidance(detail.usage_guidance || "");
    } catch {
      // ignore
    }
  };

  const saveMetaEdit = async () => {
    if (!selectedVariant) return;
    setSavingMeta(true);
    try {
      await apiPut(`/resume-variants/${selectedVariant.id}`, {
        name: editName.trim(),
        description: editDesc.trim() || null,
        target_roles: editTargetRoles.trim() || null,
        matching_keywords: editKeywords.trim()
          ? editKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : null,
        usage_guidance: editGuidance.trim() || null,
      });
      setEditingMeta(false);
      await openDetail(selectedVariant.id);
      await loadVariants();
    } finally {
      setSavingMeta(false);
    }
  };

  // Upload handlers
  const handleFileDrop = async (e: React.DragEvent, variantId: string) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(variantId, file);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, variantId: string) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(variantId, file);
    e.target.value = "";
  };

  const uploadFile = async (variantId: string, file: File) => {
    setUploadVariantId(variantId);
    setUploading(true);
    setExtraction(null);
    setReviewData(null);
    try {
      const result = await apiUpload<ResumeUploadExtraction>(
        `/resume-variants/${variantId}/upload`,
        file,
      );
      setExtraction(result);
      setReviewData({ ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      alert(msg);
      setUploadVariantId(null);
    } finally {
      setUploading(false);
    }
  };

  const saveReviewedUpload = async () => {
    if (!uploadVariantId || !reviewData) return;
    setSavingUpload(true);
    try {
      await apiPost(`/resume-variants/${uploadVariantId}/save-upload`, {
        headline: reviewData.headline,
        summary: reviewData.summary,
        skills: reviewData.skills,
        experiences: reviewData.experiences,
        educations: reviewData.educations,
        certifications: reviewData.certifications,
        additional_sections: reviewData.additional_sections,
        raw_resume_text: reviewData.raw_resume_text,
        change_summary: "Resume uploaded and reviewed",
      });
      setUploadVariantId(null);
      setExtraction(null);
      setReviewData(null);
      await loadVariants();
      if (selectedVariant) await openDetail(selectedVariant.id);
    } finally {
      setSavingUpload(false);
    }
  };

  // Version history
  const loadVersions = async (variantId: string) => {
    setShowVersions(variantId);
    setLoadingVersions(true);
    try {
      const data = await apiGet<ResumeVariantVersion[]>(
        `/resume-variants/${variantId}/versions`,
      );
      setVersions(data);
    } finally {
      setLoadingVersions(false);
    }
  };

  const restoreVersion = async (variantId: string, versionNumber: number) => {
    if (!confirm(`Restore to version ${versionNumber}? A new version will be created.`)) return;
    setRestoringVersion(versionNumber);
    try {
      await apiPost(`/resume-variants/${variantId}/restore/${versionNumber}`);
      await loadVersions(variantId);
      await loadVariants();
      if (selectedVariant) await openDetail(selectedVariant.id);
    } finally {
      setRestoringVersion(null);
    }
  };

  // Diff viewer
  const openDiff = async (variantId: string) => {
    setDiffVariantId(variantId);
    setDiffResult(null);
    // Load versions for selection
    const data = await apiGet<ResumeVariantVersion[]>(
      `/resume-variants/${variantId}/versions`,
    );
    setVersions(data);
    if (data.length >= 2) {
      setDiffVersionA(data[1].version_number);
      setDiffVersionB(data[0].version_number);
    }
  };

  const runDiff = async () => {
    if (!diffVariantId || diffVersionA === diffVersionB) return;
    setLoadingDiff(true);
    try {
      const result = await apiGet<VariantDiffResult>(
        `/resume-variants/${diffVariantId}/diff?version_a=${diffVersionA}&version_b=${diffVersionB}`,
      );
      setDiffResult(result);
    } finally {
      setLoadingDiff(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resume Variants</h1>
          <p className="text-sm text-muted-foreground">
            Manage multiple resume versions tailored to different types of roles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            disabled={loadingStats}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            {loadingStats ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            Interview Stats
          </button>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Variant
            </button>
          )}
        </div>
      </div>

      {/* Interview Success Stats */}
      {showStats && stats && (
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Interview Success by Variant</h2>
            </div>
            <button onClick={() => setShowStats(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {stats.variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No application data yet. Stats will appear once you start applying with resume variants.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium">Variant</th>
                    <th className="pb-2 font-medium text-center">Applications</th>
                    <th className="pb-2 font-medium text-center">Original</th>
                    <th className="pb-2 font-medium text-center">Tailored</th>
                    <th className="pb-2 font-medium text-center">Interviews</th>
                    <th className="pb-2 font-medium text-center">Offers</th>
                    <th className="pb-2 font-medium text-center">Interview Rate</th>
                    <th className="pb-2 font-medium text-center">Offer Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.variants.map((s) => (
                    <tr key={s.variant_id} className="border-b border-border/50">
                      <td className="py-2 font-medium">
                        {s.variant_name}
                        {s.is_default && (
                          <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                        )}
                      </td>
                      <td className="py-2 text-center">{s.total_applications}</td>
                      <td className="py-2 text-center">{s.original_count}</td>
                      <td className="py-2 text-center">{s.tailored_count}</td>
                      <td className="py-2 text-center">{s.status_breakdown.interviewing}</td>
                      <td className="py-2 text-center">{s.status_breakdown.offer}</td>
                      <td className="py-2 text-center">
                        <span className={`font-semibold ${s.interview_rate >= 50 ? "text-green-600 dark:text-green-400" : s.interview_rate >= 25 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
                          {s.interview_rate}%
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        <span className={`font-semibold ${s.offer_rate > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                          {s.offer_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.unlinked_applications > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  + {stats.unlinked_applications} application{stats.unlinked_applications !== 1 ? "s" : ""} without a variant linked
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Variant Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {variants.map((v) => (
          <div
            key={v.id}
            className="rounded-lg border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{v.name}</h3>
              </div>
              <div className="flex items-center gap-1">
                {v.is_default && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "color-mix(in oklch, var(--primary) 15%, transparent)", color: "var(--primary)" }}>
                    <Star className="h-3 w-3" /> Default
                  </span>
                )}
              </div>
            </div>
            {v.description && (
              <p className="text-sm text-muted-foreground mb-2">{v.description}</p>
            )}
            {v.target_roles && (
              <p className="text-xs text-muted-foreground mb-2">
                <strong>Target roles:</strong> {v.target_roles}
              </p>
            )}
            {v.usage_guidance && (
              <p className="text-xs text-muted-foreground mb-3">{v.usage_guidance}</p>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
              <span>v{v.current_version}</span>
              <span>·</span>
              <span>{v.headline ? "Content loaded" : "No content yet"}</span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => openDetail(v.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                <Pencil className="h-3 w-3" /> View / Edit
              </button>
              {canEdit && (
                <>
                  <label className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors cursor-pointer">
                    <Upload className="h-3 w-3" /> Upload
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.doc,.txt"
                      onChange={(e) => handleFileSelect(e, v.id)}
                    />
                  </label>
                  <button
                    onClick={() => loadVersions(v.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    <History className="h-3 w-3" /> Versions
                  </button>
                  {v.current_version > 1 && (
                    <button
                      onClick={() => openDiff(v.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      <GitCompareArrows className="h-3 w-3" /> Compare
                    </button>
                  )}
                  {!v.is_default && (
                    <button
                      onClick={() => handleSetDefault(v.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                      title="Set as default"
                    >
                      <StarOff className="h-3 w-3" /> Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>

            {/* Drop zone overlay */}
            {canEdit && (
              <div
                className={`mt-3 rounded-md border-2 border-dashed p-4 text-center text-xs transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => handleFileDrop(e, v.id)}
              >
                <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Drop resume file here (PDF, Word, TXT)
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {variants.length === 0 && (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No resume variants yet</p>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create Your First Variant
            </button>
          )}
        </div>
      )}

      {/* === Create Modal === */}
      {showCreate && (
        <Modal title="Create Resume Variant" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <Field label="Variant Name" required>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g., Adaptable Architect"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="When to use this variant..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Target Roles (comma-separated)">
              <input
                value={createTargetRoles}
                onChange={(e) => setCreateTargetRoles(e.target.value)}
                placeholder="Security Architect, Principal Architect"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Matching Keywords (comma-separated)">
              <input
                value={createKeywords}
                onChange={(e) => setCreateKeywords(e.target.value)}
                placeholder="assess, build, architect, security design"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Usage Guidance">
              <textarea
                value={createGuidance}
                onChange={(e) => setCreateGuidance(e.target.value)}
                placeholder="Use for 60-70% of applications..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createIsDefault}
                onChange={(e) => setCreateIsDefault(e.target.checked)}
                className="rounded border-input"
              />
              Set as default variant
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createName.trim() || creating}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* === Upload Review Modal === */}
      {uploadVariantId && (uploading || extraction) && (
        <Modal
          title="Review Extracted Resume Data"
          onClose={() => {
            setUploadVariantId(null);
            setExtraction(null);
            setReviewData(null);
          }}
          wide
        >
          {uploading ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                AI is reading your resume and extracting all information...
              </p>
            </div>
          ) : reviewData ? (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="rounded-md border border-border bg-accent/30 p-3 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  Review the extracted data below. You can edit any field before saving.
                  The AI extracted everything it found -- adjust anything it interpreted differently
                  than you intended.
                </span>
              </div>

              <Field label="Headline">
                <input
                  value={reviewData.headline || ""}
                  onChange={(e) => setReviewData({ ...reviewData, headline: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </Field>

              <Field label="Summary">
                <textarea
                  value={reviewData.summary || ""}
                  onChange={(e) => setReviewData({ ...reviewData, summary: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </Field>

              {/* Skills */}
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Skills ({reviewData.skills?.length || 0})
                </h4>
                <div className="space-y-2">
                  {(reviewData.skills || []).map((skill, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                      <input
                        value={skill.skill_name}
                        onChange={(e) => {
                          const updated = [...(reviewData.skills || [])];
                          updated[i] = { ...updated[i], skill_name: e.target.value };
                          setReviewData({ ...reviewData, skills: updated });
                        }}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                      />
                      <select
                        value={skill.proficiency_level}
                        onChange={(e) => {
                          const updated = [...(reviewData.skills || [])];
                          updated[i] = { ...updated[i], proficiency_level: e.target.value };
                          setReviewData({ ...reviewData, skills: updated });
                        }}
                        className="rounded border border-input bg-background px-2 py-1 text-sm"
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="expert">Expert</option>
                      </select>
                      <button
                        onClick={() => {
                          const updated = (reviewData.skills || []).filter((_, j) => j !== i);
                          setReviewData({ ...reviewData, skills: updated });
                        }}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Experiences */}
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Experience ({reviewData.experiences?.length || 0})
                </h4>
                <div className="space-y-3">
                  {(reviewData.experiences || []).map((exp, i) => (
                    <div key={i} className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={exp.title}
                          onChange={(e) => {
                            const updated = [...(reviewData.experiences || [])];
                            updated[i] = { ...updated[i], title: e.target.value };
                            setReviewData({ ...reviewData, experiences: updated });
                          }}
                          placeholder="Title"
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                        />
                        <input
                          value={exp.company}
                          onChange={(e) => {
                            const updated = [...(reviewData.experiences || [])];
                            updated[i] = { ...updated[i], company: e.target.value };
                            setReviewData({ ...reviewData, experiences: updated });
                          }}
                          placeholder="Company"
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => {
                            const updated = (reviewData.experiences || []).filter((_, j) => j !== i);
                            setReviewData({ ...reviewData, experiences: updated });
                          }}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        value={exp.description || ""}
                        onChange={(e) => {
                          const updated = [...(reviewData.experiences || [])];
                          updated[i] = { ...updated[i], description: e.target.value };
                          setReviewData({ ...reviewData, experiences: updated });
                        }}
                        placeholder="Description & responsibilities"
                        rows={3}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                      />
                      {exp.accomplishments && exp.accomplishments.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <strong>Accomplishments:</strong> {exp.accomplishments.join(" · ")}
                        </div>
                      )}
                      {exp.leadership_indicators && exp.leadership_indicators.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <strong>Leadership:</strong> {exp.leadership_indicators.join(" · ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Education */}
              <div>
                <h4 className="text-sm font-semibold mb-2">
                  Education ({reviewData.educations?.length || 0})
                </h4>
                <div className="space-y-2">
                  {(reviewData.educations || []).map((edu, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                      <input
                        value={edu.institution}
                        onChange={(e) => {
                          const updated = [...(reviewData.educations || [])];
                          updated[i] = { ...updated[i], institution: e.target.value };
                          setReviewData({ ...reviewData, educations: updated });
                        }}
                        placeholder="Institution"
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                      />
                      <input
                        value={edu.degree || ""}
                        onChange={(e) => {
                          const updated = [...(reviewData.educations || [])];
                          updated[i] = { ...updated[i], degree: e.target.value };
                          setReviewData({ ...reviewData, educations: updated });
                        }}
                        placeholder="Degree"
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => {
                          const updated = (reviewData.educations || []).filter((_, j) => j !== i);
                          setReviewData({ ...reviewData, educations: updated });
                        }}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Certifications */}
              {(reviewData.certifications || []).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">
                    Certifications ({reviewData.certifications.length})
                  </h4>
                  <div className="space-y-2">
                    {reviewData.certifications.map((cert, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <input
                          value={cert.name}
                          onChange={(e) => {
                            const updated = [...reviewData.certifications];
                            updated[i] = { ...updated[i], name: e.target.value };
                            setReviewData({ ...reviewData, certifications: updated });
                          }}
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                        />
                        <input
                          value={cert.issuer || ""}
                          onChange={(e) => {
                            const updated = [...reviewData.certifications];
                            updated[i] = { ...updated[i], issuer: e.target.value };
                            setReviewData({ ...reviewData, certifications: updated });
                          }}
                          placeholder="Issuer"
                          className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => {
                            const updated = reviewData.certifications.filter((_, j) => j !== i);
                            setReviewData({ ...reviewData, certifications: updated });
                          }}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional sections */}
              {reviewData.additional_sections &&
                Object.keys(reviewData.additional_sections).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Additional Sections</h4>
                    {Object.entries(reviewData.additional_sections).map(([key, val]) => (
                      <div key={key} className="rounded-md border border-border p-2 mb-2">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">
                          {key}
                        </p>
                        <p className="text-sm">{String(val)}</p>
                      </div>
                    ))}
                  </div>
                )}

              <div className="flex justify-end gap-2 sticky bottom-0 bg-card pt-4 border-t border-border">
                <button
                  onClick={() => {
                    setUploadVariantId(null);
                    setExtraction(null);
                    setReviewData(null);
                  }}
                  className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={saveReviewedUpload}
                  disabled={savingUpload}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingUpload ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save to Variant
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* === Detail Modal === */}
      {selectedVariant && (
        <Modal
          title={selectedVariant.name}
          onClose={() => {
            setSelectedVariant(null);
            setEditingMeta(false);
          }}
          wide
        >
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Meta section */}
            {editingMeta ? (
              <div className="space-y-3 rounded-md border border-border p-4">
                <Field label="Name">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Description">
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Target Roles">
                  <input value={editTargetRoles} onChange={(e) => setEditTargetRoles(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Matching Keywords">
                  <input value={editKeywords} onChange={(e) => setEditKeywords(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Usage Guidance">
                  <textarea value={editGuidance} onChange={(e) => setEditGuidance(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </Field>
                <div className="flex gap-2">
                  <button onClick={() => setEditingMeta(false)} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">Cancel</button>
                  <button onClick={saveMetaEdit} disabled={savingMeta} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {savingMeta && <Loader2 className="h-3 w-3 animate-spin" />}
                    <Save className="h-3 w-3" /> Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    {selectedVariant.description && <p className="text-sm text-muted-foreground">{selectedVariant.description}</p>}
                    {selectedVariant.target_roles && <p className="text-xs text-muted-foreground"><strong>Target:</strong> {selectedVariant.target_roles}</p>}
                    {selectedVariant.matching_keywords && <p className="text-xs text-muted-foreground"><strong>Keywords:</strong> {selectedVariant.matching_keywords.join(", ")}</p>}
                    {selectedVariant.usage_guidance && <p className="text-xs text-muted-foreground">{selectedVariant.usage_guidance}</p>}
                    <p className="text-xs text-muted-foreground">Version {selectedVariant.current_version} · Updated {formatDate(selectedVariant.updated_at)}</p>
                  </div>
                  {canEdit && (
                    <button onClick={() => setEditingMeta(true)} className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-accent">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Content sections */}
            {selectedVariant.headline && (
              <ContentSection title="Headline" content={selectedVariant.headline} />
            )}
            {selectedVariant.summary && (
              <ContentSection title="Summary" content={selectedVariant.summary} />
            )}
            {selectedVariant.skills && selectedVariant.skills.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Skills ({selectedVariant.skills.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedVariant.skills.map((s: Record<string, unknown>, i: number) => (
                    <span key={i} className="rounded-full border border-border px-2.5 py-1 text-xs">
                      {String(s.skill_name)}
                      {s.proficiency_level ? <span className="ml-1 text-muted-foreground">({String(s.proficiency_level)})</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selectedVariant.experiences && selectedVariant.experiences.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Experience ({selectedVariant.experiences.length})</h4>
                <div className="space-y-3">
                  {selectedVariant.experiences.map((exp: Record<string, unknown>, i: number) => (
                    <div key={i} className="rounded-md border border-border p-3">
                      <p className="font-medium text-sm">{String(exp.title)} at {String(exp.company)}</p>
                      <p className="text-xs text-muted-foreground">{String(exp.start_date || "")} – {exp.is_current ? "Present" : String(exp.end_date || "")}</p>
                      {exp.description ? <p className="text-sm mt-1">{String(exp.description)}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedVariant.educations && selectedVariant.educations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Education</h4>
                {selectedVariant.educations.map((edu: Record<string, unknown>, i: number) => (
                  <p key={i} className="text-sm">{String(edu.degree || "")} – {String(edu.institution)}</p>
                ))}
              </div>
            )}
            {selectedVariant.certifications && selectedVariant.certifications.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Certifications</h4>
                {selectedVariant.certifications.map((c: Record<string, unknown>, i: number) => (
                  <p key={i} className="text-sm">{String(c.name)}{c.issuer ? ` — ${String(c.issuer)}` : ""}</p>
                ))}
              </div>
            )}
            {!selectedVariant.headline && !selectedVariant.summary && (
              <div className="text-center py-8">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No content yet. Upload a resume to populate this variant.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* === Version History Modal === */}
      {showVersions && (
        <Modal title="Version History" onClose={() => setShowVersions(null)}>
          {loadingVersions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No versions saved yet. Upload or edit the variant to create a version.
            </p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="flex items-center justify-between rounded-md border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">Version {ver.version_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(ver.created_at)}
                      {ver.change_summary && ` · ${ver.change_summary}`}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => restoreVersion(showVersions, ver.version_number)}
                      disabled={restoringVersion === ver.version_number}
                      className="inline-flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                    >
                      {restoringVersion === ver.version_number ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* === Diff Viewer Modal === */}
      {diffVariantId && (
        <Modal title="Compare Versions" onClose={() => { setDiffVariantId(null); setDiffResult(null); }} wide>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Field label="Version A">
                <select
                  value={diffVersionA}
                  onChange={(e) => setDiffVersionA(Number(e.target.value))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.version_number} value={v.version_number}>
                      v{v.version_number} — {formatDate(v.created_at)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Version B">
                <select
                  value={diffVersionB}
                  onChange={(e) => setDiffVersionB(Number(e.target.value))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.version_number} value={v.version_number}>
                      v{v.version_number} — {formatDate(v.created_at)}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                onClick={runDiff}
                disabled={loadingDiff || diffVersionA === diffVersionB}
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loadingDiff && <Loader2 className="h-4 w-4 animate-spin" />}
                Compare
              </button>
            </div>

            {diffResult && (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                {diffResult.sections.map((section) => (
                  <div
                    key={section.section}
                    className={`rounded-md border p-3 ${
                      section.changed
                        ? "border-primary/50 bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-semibold">{section.label}</h4>
                      {section.changed ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "color-mix(in oklch, var(--primary) 15%, transparent)", color: "var(--primary)" }}>
                          Changed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No changes</span>
                      )}
                    </div>
                    {section.changed && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            v{diffResult.version_a}
                          </p>
                          <pre className="whitespace-pre-wrap text-xs rounded-md border border-border bg-background p-2 max-h-48 overflow-y-auto">
                            {section.value_a || "(empty)"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            v{diffResult.version_b}
                          </p>
                          <pre className="whitespace-pre-wrap text-xs rounded-md border border-border bg-background p-2 max-h-48 overflow-y-auto">
                            {section.value_b || "(empty)"}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- Helper Components ---

function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`relative rounded-lg border border-border bg-card shadow-lg ${
          wide ? "w-full max-w-4xl" : "w-full max-w-lg"
        } max-h-[90vh] overflow-hidden mx-4`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function ContentSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground">{content}</p>
    </div>
  );
}
