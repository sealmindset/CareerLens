"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type {
  Profile,
  ProfileSkill,
  ProfileExperience,
  ProfileEducation,
  ResumeUploadResult,
  ExperienceAIResponse,
  BrandAIResponse,
} from "@/lib/types";
import { MarkdownContent } from "@/components/markdown-content";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Loader2,
  Sparkles,
  MessageSquare,
  Lightbulb,
  HelpCircle,
  Send,
  Undo2,
} from "lucide-react";

const proficiencyLevels = ["beginner", "intermediate", "advanced", "expert"];
const sourceOptions = ["manual", "resume", "linkedin"];

export default function ProfilePage() {
  const { hasPermission } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [showResumeUpload, setShowResumeUpload] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ResumeUploadResult | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // LinkedIn import
  const [linkedinImporting, setLinkedinImporting] = useState(false);
  const [linkedinResult, setLinkedinResult] = useState<ResumeUploadResult | null>(null);
  const [linkedinError, setLinkedinError] = useState("");
  const [showLinkedinImport, setShowLinkedinImport] = useState(false);

  // Skill form
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [skillProficiency, setSkillProficiency] = useState("intermediate");
  const [skillYears, setSkillYears] = useState("");
  const [skillSource, setSkillSource] = useState("manual");

  // Experience form
  const [showExpForm, setShowExpForm] = useState(false);
  const [editingExp, setEditingExp] = useState<ProfileExperience | null>(null);
  const [expCompany, setExpCompany] = useState("");
  const [expTitle, setExpTitle] = useState("");
  const [expDescription, setExpDescription] = useState("");
  const [expStartDate, setExpStartDate] = useState("");
  const [expEndDate, setExpEndDate] = useState("");
  const [expIsCurrent, setExpIsCurrent] = useState(false);

  // Education form
  const [showEduForm, setShowEduForm] = useState(false);
  const [eduInstitution, setEduInstitution] = useState("");
  const [eduDegree, setEduDegree] = useState("");
  const [eduField, setEduField] = useState("");
  const [eduGradDate, setEduGradDate] = useState("");

  // AI Modal state
  const [aiModalExp, setAiModalExp] = useState<ProfileExperience | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [aiMessage, setAiMessage] = useState("");
  const [aiEnhanced, setAiEnhanced] = useState<string>("");
  const [aiEditing, setAiEditing] = useState(false);
  const [aiPreviousDesc, setAiPreviousDesc] = useState<string | null>(null);
  const [applyingAi, setApplyingAi] = useState(false);

  // Brand AI Modal state (headline/summary)
  const [brandField, setBrandField] = useState<"headline" | "summary" | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandHistory, setBrandHistory] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [brandMessage, setBrandMessage] = useState("");
  const [brandEnhanced, setBrandEnhanced] = useState("");
  const [brandEditing, setBrandEditing] = useState(false);

  // Extract tagged description from AI response.
  // AI wraps descriptions in ===DESCRIPTION=== / ===END_DESCRIPTION=== tags.
  const DESC_START = "===DESCRIPTION===";
  const DESC_END = "===END_DESCRIPTION===";

  const extractDescription = (text: string): string | null => {
    const startIdx = text.indexOf(DESC_START);
    const endIdx = text.indexOf(DESC_END);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
    return text.slice(startIdx + DESC_START.length, endIdx).trim();
  };

  const getCommentary = (text: string): string => {
    // Everything outside the description tags
    const startIdx = text.indexOf(DESC_START);
    const endIdx = text.indexOf(DESC_END);
    if (startIdx === -1 || endIdx === -1) return text;
    const before = text.slice(0, startIdx).trim();
    const after = text.slice(endIdx + DESC_END.length).trim();
    return [before, after].filter(Boolean).join("\n\n");
  };

  const hasDescription = (text: string): boolean =>
    text.includes(DESC_START) && text.includes(DESC_END);

  const canEdit = hasPermission("profile", "edit");

  const fetchProfile = useCallback(async () => {
    try {
      const data = await apiGet<Profile>("/profile");
      setProfile(data);
      setHeadline(data.headline || "");
      setSummary(data.summary || "");
      setLinkedinUrl(data.linkedin_url || "");
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiPut("/profile", {
        headline: headline || null,
        summary: summary || null,
        linkedin_url: linkedinUrl || null,
      });
      await fetchProfile();
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleResumeUpload = async (file: File) => {
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];
    const validExts = [".pdf", ".docx", ".txt"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setUploadError("Please upload a PDF, Word (.docx), or text file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File too large (max 10 MB).");
      return;
    }

    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const result = await apiUpload<ResumeUploadResult>("/profile/upload-resume", file);
      setUploadResult(result);
      await fetchProfile();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleResumeUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleResumeUpload(file);
    e.target.value = "";
  };

  const handleLinkedinImport = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setLinkedinError("Please upload a ZIP file from LinkedIn's data export.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setLinkedinError("File too large (max 50 MB).");
      return;
    }
    setLinkedinImporting(true);
    setLinkedinError("");
    setLinkedinResult(null);
    try {
      const result = await apiUpload<ResumeUploadResult>("/profile/import-linkedin", file);
      setLinkedinResult(result);
      await fetchProfile();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setLinkedinError(message);
    } finally {
      setLinkedinImporting(false);
    }
  };

  const handleLinkedinFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLinkedinImport(file);
    e.target.value = "";
  };

  const handleLinkedinDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleLinkedinImport(file);
  };

  const addSkill = async () => {
    try {
      await apiPost("/profile/skills", {
        skill_name: skillName,
        proficiency_level: skillProficiency,
        years_experience: skillYears ? Number(skillYears) : null,
        source: skillSource,
      });
      setShowSkillForm(false);
      setSkillName("");
      setSkillYears("");
      await fetchProfile();
    } catch (err) {
      console.error("Failed to add skill:", err);
    }
  };

  const deleteSkill = async (id: string) => {
    try {
      await apiDelete(`/profile/skills/${id}`);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to delete skill:", err);
    }
  };

  const resetExpForm = () => {
    setExpCompany("");
    setExpTitle("");
    setExpDescription("");
    setExpStartDate("");
    setExpEndDate("");
    setExpIsCurrent(false);
    setEditingExp(null);
  };

  const openEditExp = (exp: ProfileExperience) => {
    setEditingExp(exp);
    setExpCompany(exp.company);
    setExpTitle(exp.title);
    setExpDescription(exp.description || "");
    setExpStartDate(exp.start_date.slice(0, 10));
    setExpEndDate(exp.end_date ? exp.end_date.slice(0, 10) : "");
    setExpIsCurrent(exp.is_current);
    setShowExpForm(true);
  };

  const saveExperience = async () => {
    const body = {
      company: expCompany,
      title: expTitle,
      description: expDescription || null,
      start_date: expStartDate,
      end_date: expIsCurrent ? null : expEndDate || null,
      is_current: expIsCurrent,
    };
    try {
      if (editingExp) {
        await apiPut(`/profile/experiences/${editingExp.id}`, body);
      } else {
        await apiPost("/profile/experiences", body);
      }
      setShowExpForm(false);
      resetExpForm();
      await fetchProfile();
    } catch (err) {
      console.error("Failed to save experience:", err);
    }
  };

  const deleteExperience = async (id: string) => {
    try {
      await apiDelete(`/profile/experiences/${id}`);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to delete experience:", err);
    }
  };

  const openAiModal = (exp: ProfileExperience) => {
    setAiModalExp(exp);
    setAiEnhanced("");
    setAiEditing(false);
    setAiHistory([]);
    setAiMessage("");
    setAiPreviousDesc(null);
  };

  const closeAiModal = () => {
    setAiModalExp(null);
    setAiEnhanced("");
    setAiEditing(false);
    setAiHistory([]);
    setAiMessage("");
  };

  const handleAiEnhance = async (exp: ProfileExperience) => {
    setAiLoading(true);
    const history = [...aiHistory];
    try {
      const resp = await apiPost<ExperienceAIResponse>(
        `/profile/experiences/${exp.id}/ai-assist`,
        {
          action: "enhance",
          message: null,
          history: history.map((m) => ({ role: m.role, content: m.content })),
        }
      );
      const raw = resp.suggestion;
      const desc = extractDescription(raw);
      if (desc) {
        setAiEnhanced(desc);
        const commentary = getCommentary(raw);
        if (commentary) {
          setAiHistory((prev) => [...prev, { role: "ai", content: commentary }]);
        }
      } else {
        // Fallback: put everything in enhanced
        setAiEnhanced(raw.trim());
        setAiHistory((prev) => [...prev, { role: "ai", content: "Enhancement complete. Review and edit the description in the middle panel, then click Apply when ready." }]);
      }
    } catch (err) {
      console.error("AI assist failed:", err);
      setAiHistory([{ role: "ai", content: "Sorry, I couldn't generate an enhancement right now. Please try again." }]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiChat = async (exp: ProfileExperience, message: string) => {
    const newHistory = [...aiHistory, { role: "user" as const, content: message }];
    setAiHistory(newHistory);
    setAiMessage("");
    setAiLoading(true);
    try {
      const resp = await apiPost<ExperienceAIResponse>(
        `/profile/experiences/${exp.id}/ai-assist`,
        {
          action: "chat",
          message,
          history: newHistory.map((m) => ({ role: m.role, content: m.content })),
        }
      );
      const raw = resp.suggestion;
      const desc = extractDescription(raw);
      if (desc) {
        // AI returned a revised description — update Enhanced panel and show commentary in chat
        setAiEnhanced(desc);
        setAiEditing(false);
        const commentary = getCommentary(raw);
        setAiHistory((prev) => [...prev, { role: "ai", content: commentary || "Updated the enhanced description." }]);
      } else {
        setAiHistory((prev) => [...prev, { role: "ai", content: raw }]);
      }
    } catch (err) {
      console.error("AI chat failed:", err);
      setAiHistory((prev) => [...prev, { role: "ai", content: "Sorry, I couldn't respond right now. Please try again." }]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiAction = async (exp: ProfileExperience, action: string) => {
    const label = action === "improve" ? "Suggest improvements for this experience" : "Ask interview questions about this experience";
    const newHistory = [...aiHistory, { role: "user" as const, content: label }];
    setAiHistory(newHistory);
    setAiLoading(true);
    try {
      const resp = await apiPost<ExperienceAIResponse>(
        `/profile/experiences/${exp.id}/ai-assist`,
        {
          action,
          message: null,
          history: newHistory.map((m) => ({ role: m.role, content: m.content })),
        }
      );
      setAiHistory((prev) => [...prev, { role: "ai", content: resp.suggestion }]);
    } catch (err) {
      console.error("AI assist failed:", err);
      setAiHistory((prev) => [...prev, { role: "ai", content: "Sorry, I couldn't respond right now. Please try again." }]);
    } finally {
      setAiLoading(false);
    }
  };

  const applyEnhanced = async () => {
    if (!aiModalExp || !aiEnhanced.trim()) return;
    setApplyingAi(true);
    try {
      setAiPreviousDesc(aiModalExp.description || "");
      await apiPut(`/profile/experiences/${aiModalExp.id}`, {
        company: aiModalExp.company,
        title: aiModalExp.title,
        description: aiEnhanced,
        start_date: aiModalExp.start_date.slice(0, 10),
        end_date: aiModalExp.end_date ? aiModalExp.end_date.slice(0, 10) : null,
        is_current: aiModalExp.is_current,
      });
      await fetchProfile();
      // Update the modal's exp reference with new description
      setAiModalExp((prev) => prev ? { ...prev, description: aiEnhanced } : null);
    } catch (err) {
      console.error("Failed to apply:", err);
    } finally {
      setApplyingAi(false);
    }
  };

  const undoApply = async () => {
    if (!aiModalExp || aiPreviousDesc === null) return;
    setApplyingAi(true);
    try {
      await apiPut(`/profile/experiences/${aiModalExp.id}`, {
        company: aiModalExp.company,
        title: aiModalExp.title,
        description: aiPreviousDesc,
        start_date: aiModalExp.start_date.slice(0, 10),
        end_date: aiModalExp.end_date ? aiModalExp.end_date.slice(0, 10) : null,
        is_current: aiModalExp.is_current,
      });
      await fetchProfile();
      setAiModalExp((prev) => prev ? { ...prev, description: aiPreviousDesc } : null);
      setAiEnhanced(aiPreviousDesc);
      setAiPreviousDesc(null);
    } catch (err) {
      console.error("Failed to undo:", err);
    } finally {
      setApplyingAi(false);
    }
  };

  // --- Brand AI helpers ---
  const BRAND_TAGS: Record<string, { start: string; end: string }> = {
    headline: { start: "===HEADLINE===", end: "===END_HEADLINE===" },
    summary: { start: "===SUMMARY===", end: "===END_SUMMARY===" },
  };

  const extractBrandContent = (text: string, field: "headline" | "summary"): string | null => {
    const { start, end } = BRAND_TAGS[field];
    const s = text.indexOf(start);
    const e = text.indexOf(end);
    if (s === -1 || e === -1 || e <= s) return null;
    return text.slice(s + start.length, e).trim();
  };

  const getBrandCommentary = (text: string, field: "headline" | "summary"): string => {
    const { start, end } = BRAND_TAGS[field];
    const s = text.indexOf(start);
    const e = text.indexOf(end);
    if (s === -1 || e === -1) return text;
    const before = text.slice(0, s).trim();
    const after = text.slice(e + end.length).trim();
    return [before, after].filter(Boolean).join("\n\n");
  };

  const openBrandModal = (field: "headline" | "summary") => {
    setBrandField(field);
    setBrandEnhanced("");
    setBrandEditing(false);
    setBrandHistory([]);
    setBrandMessage("");
  };

  const closeBrandModal = () => {
    setBrandField(null);
    setBrandEnhanced("");
    setBrandEditing(false);
    setBrandHistory([]);
    setBrandMessage("");
  };

  const handleBrandGenerate = async (field: "headline" | "summary") => {
    setBrandLoading(true);
    try {
      const resp = await apiPost<BrandAIResponse>("/profile/brand-assist", {
        field,
        action: "generate",
        message: null,
        history: brandHistory.map((m) => ({ role: m.role, content: m.content })),
      });
      const content = extractBrandContent(resp.suggestion, field);
      if (content) {
        setBrandEnhanced(content);
        const commentary = getBrandCommentary(resp.suggestion, field);
        if (commentary) {
          setBrandHistory((prev) => [...prev, { role: "ai", content: commentary }]);
        }
      } else {
        setBrandEnhanced(resp.suggestion.trim());
      }
    } catch (err) {
      console.error("Brand AI failed:", err);
      setBrandHistory([{ role: "ai", content: "Sorry, I couldn't generate content right now. Please try again." }]);
    } finally {
      setBrandLoading(false);
    }
  };

  const handleBrandChat = async (field: "headline" | "summary", message: string) => {
    const newHistory = [...brandHistory, { role: "user" as const, content: message }];
    setBrandHistory(newHistory);
    setBrandMessage("");
    setBrandLoading(true);
    try {
      const resp = await apiPost<BrandAIResponse>("/profile/brand-assist", {
        field,
        action: "chat",
        message,
        history: newHistory.map((m) => ({ role: m.role, content: m.content })),
      });
      const content = extractBrandContent(resp.suggestion, field);
      if (content) {
        setBrandEnhanced(content);
        setBrandEditing(false);
        const commentary = getBrandCommentary(resp.suggestion, field);
        setBrandHistory((prev) => [...prev, { role: "ai", content: commentary || `Updated the ${field}.` }]);
      } else {
        setBrandHistory((prev) => [...prev, { role: "ai", content: resp.suggestion }]);
      }
    } catch (err) {
      console.error("Brand AI chat failed:", err);
      setBrandHistory((prev) => [...prev, { role: "ai", content: "Sorry, I couldn't respond right now. Please try again." }]);
    } finally {
      setBrandLoading(false);
    }
  };

  const applyBrandContent = async () => {
    if (!brandField || !brandEnhanced.trim()) return;
    if (brandField === "headline") {
      setHeadline(brandEnhanced);
    } else {
      setSummary(brandEnhanced);
    }
    closeBrandModal();
  };

  const addEducation = async () => {
    try {
      await apiPost("/profile/educations", {
        institution: eduInstitution,
        degree: eduDegree,
        field_of_study: eduField || null,
        graduation_date: eduGradDate || null,
      });
      setShowEduForm(false);
      setEduInstitution("");
      setEduDegree("");
      setEduField("");
      setEduGradDate("");
      await fetchProfile();
    } catch (err) {
      console.error("Failed to add education:", err);
    }
  };

  const deleteEducation = async (id: string) => {
    try {
      await apiDelete(`/profile/educations/${id}`);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to delete education:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Manage your professional profile, skills, and experience.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile
          </button>
        )}
      </div>

      {/* Headline */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <label className="block text-sm font-medium">Headline</label>
          {canEdit && (
            <button
              onClick={() => openBrandModal("headline")}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              title="AI Brand Advisor"
            >
              <Sparkles className="h-3 w-3" />
              AI
            </button>
          )}
        </div>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Senior Software Engineer | Full-Stack Developer"
          disabled={!canEdit}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        />
      </div>

      {/* Summary */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <label className="block text-sm font-medium">Summary</label>
          {canEdit && (
            <button
              onClick={() => openBrandModal("summary")}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              title="AI Brand Advisor"
            >
              <Sparkles className="h-3 w-3" />
              AI
            </button>
          )}
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Write a brief professional summary..."
          rows={4}
          disabled={!canEdit}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 resize-none"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        />
      </div>

      {/* LinkedIn URL */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <label className="block text-sm font-medium mb-2">
          <LinkIcon className="inline h-4 w-4 mr-1" />
          LinkedIn URL
        </label>
        <input
          type="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://linkedin.com/in/yourprofile"
          disabled={!canEdit}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        />
      </div>

      {/* LinkedIn Import */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium">
            <LinkIcon className="inline h-4 w-4 mr-1" />
            LinkedIn Data Import
          </label>
          {canEdit && (
            <button
              onClick={() => {
                setShowLinkedinImport(!showLinkedinImport);
                setLinkedinResult(null);
                setLinkedinError("");
              }}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              <Upload className="h-4 w-4" />
              {showLinkedinImport ? "Cancel" : "Import from LinkedIn"}
            </button>
          )}
        </div>

        {!showLinkedinImport && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Import your skills, experience, and education from LinkedIn&apos;s data export.
          </p>
        )}

        {showLinkedinImport && (
          <div className="space-y-3">
            {/* Instructions */}
            <div
              className="rounded-md border p-3 text-xs space-y-1"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
            >
              <p className="font-medium text-sm">How to get your LinkedIn data:</p>
              <ol className="list-decimal list-inside space-y-0.5" style={{ color: "var(--muted-foreground)" }}>
                <li>Go to <strong>LinkedIn Settings &amp; Privacy</strong></li>
                <li>Click <strong>Data privacy</strong> &rarr; <strong>Get a copy of your data</strong></li>
                <li>Select the data you want (Profile, Positions, Education, Skills)</li>
                <li>Click <strong>Request archive</strong> -- LinkedIn will email you a download link</li>
                <li>Download the ZIP file and upload it here</li>
              </ol>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleLinkedinDrop}
              className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver ? "border-primary bg-primary/5" : ""
              }`}
              style={{
                borderColor: dragOver ? "var(--primary)" : "var(--border)",
              }}
            >
              {linkedinImporting ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin mb-2" style={{ color: "var(--primary)" }} />
                  <p className="text-sm font-medium">Importing LinkedIn data...</p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                    Parsing your profile, experience, education, and skills
                  </p>
                </>
              ) : (
                <>
                  <LinkIcon className="h-8 w-8 mb-2" style={{ color: "var(--muted-foreground)" }} />
                  <p className="text-sm font-medium">
                    Drag and drop your LinkedIn export ZIP here
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                    ZIP file from LinkedIn&apos;s &quot;Download your data&quot; feature
                  </p>
                  <label
                    className="mt-3 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    Choose ZIP File
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleLinkedinFileSelect}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>

            {/* Import result */}
            {linkedinResult && !linkedinResult.error && (
              <div
                className="flex items-start gap-3 rounded-md border p-3"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
              >
                <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "hsl(142, 76%, 36%)" }} />
                <div className="text-sm">
                  <p className="font-medium">LinkedIn data imported successfully!</p>
                  <p style={{ color: "var(--muted-foreground)" }}>
                    Added {linkedinResult.skills_added} skill{linkedinResult.skills_added !== 1 ? "s" : ""},
                    {" "}{linkedinResult.experiences_added} experience{linkedinResult.experiences_added !== 1 ? "s" : ""},
                    {" "}{linkedinResult.educations_added} education{linkedinResult.educations_added !== 1 ? "s" : ""}.
                    {" "}Duplicates were skipped automatically.
                  </p>
                </div>
              </div>
            )}

            {/* Import error */}
            {(linkedinError || linkedinResult?.error) && (
              <div
                className="flex items-start gap-3 rounded-md border p-3"
                style={{ borderColor: "hsl(0, 84%, 60%)", backgroundColor: "hsl(0, 84%, 97%)" }}
              >
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "hsl(0, 84%, 60%)" }} />
                <div className="text-sm">
                  <p className="font-medium" style={{ color: "hsl(0, 84%, 40%)" }}>Import failed</p>
                  <p style={{ color: "hsl(0, 84%, 40%)" }}>
                    {linkedinError || linkedinResult?.error}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resume Upload */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium">
            <FileText className="inline h-4 w-4 mr-1" />
            Resume
          </label>
          {canEdit && (
            <button
              onClick={() => {
                setShowResumeUpload(!showResumeUpload);
                setUploadResult(null);
                setUploadError("");
              }}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              <Upload className="h-4 w-4" />
              {showResumeUpload ? "Cancel" : profile?.raw_resume_text ? "Re-upload Resume" : "Upload Resume"}
            </button>
          )}
        </div>

        {showResumeUpload ? (
          <div className="space-y-3">
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver ? "border-primary bg-primary/5" : ""
              }`}
              style={{
                borderColor: dragOver ? "var(--primary)" : "var(--border)",
              }}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin mb-2" style={{ color: "var(--primary)" }} />
                  <p className="text-sm font-medium">Parsing your resume with AI...</p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                    This may take a few seconds
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 mb-2" style={{ color: "var(--muted-foreground)" }} />
                  <p className="text-sm font-medium">
                    Drag and drop your resume here
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                    PDF, Word (.docx), or text file (max 10 MB)
                  </p>
                  <label
                    className="mt-3 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium cursor-pointer transition-colors"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    Choose File
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>

            {/* Upload result */}
            {uploadResult && !uploadResult.error && (
              <div
                className="flex items-start gap-3 rounded-md border p-3"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
              >
                <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "hsl(142, 76%, 36%)" }} />
                <div className="text-sm">
                  <p className="font-medium">Resume parsed successfully!</p>
                  <p style={{ color: "var(--muted-foreground)" }}>
                    Added {uploadResult.skills_added} skill{uploadResult.skills_added !== 1 ? "s" : ""},
                    {" "}{uploadResult.experiences_added} experience{uploadResult.experiences_added !== 1 ? "s" : ""},
                    {" "}{uploadResult.educations_added} education{uploadResult.educations_added !== 1 ? "s" : ""}.
                    {" "}Raw text saved ({uploadResult.raw_text_length.toLocaleString()} characters).
                  </p>
                </div>
              </div>
            )}

            {/* Upload error */}
            {(uploadError || uploadResult?.error) && (
              <div
                className="flex items-start gap-3 rounded-md border p-3"
                style={{ borderColor: "var(--destructive)", backgroundColor: "hsl(0 84% 60% / 0.1)" }}
              >
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: "var(--destructive)" }} />
                <p className="text-sm">{uploadError || uploadResult?.error}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {profile?.raw_resume_text
              ? `Resume uploaded (${profile.raw_resume_text.length.toLocaleString()} characters). Skills, experience, and education were extracted and added to your profile.`
              : "No resume uploaded yet. Upload a PDF or Word document to auto-fill your profile."}
          </p>
        )}
      </div>

      {/* Skills Section */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Skills</h2>
          {canEdit && (
            <button
              onClick={() => setShowSkillForm(!showSkillForm)}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              {showSkillForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showSkillForm ? "Cancel" : "Add Skill"}
            </button>
          )}
        </div>

        {showSkillForm && (
          <div
            className="mb-4 rounded-md border p-4 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Skill Name</label>
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="e.g. TypeScript"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Proficiency</label>
                <select
                  value={skillProficiency}
                  onChange={(e) => setSkillProficiency(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  {proficiencyLevels.map((level) => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Years Experience</label>
                <input
                  type="number"
                  value={skillYears}
                  onChange={(e) => setSkillYears(e.target.value)}
                  placeholder="Optional"
                  min="0"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Source</label>
                <select
                  value={skillSource}
                  onChange={(e) => setSkillSource(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  {sourceOptions.map((src) => (
                    <option key={src} value={src}>
                      {src.charAt(0).toUpperCase() + src.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={addSkill}
              disabled={!skillName.trim()}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus className="h-4 w-4" />
              Add Skill
            </button>
          </div>
        )}

        {profile?.skills && profile.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <div
                key={skill.id}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="font-medium">{skill.skill_name}</span>
                <span
                  className="text-xs rounded-full px-1.5 py-0.5"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-foreground)",
                  }}
                >
                  {skill.proficiency_level}
                </span>
                {skill.source !== "manual" && (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    ({skill.source})
                  </span>
                )}
                {canEdit && (
                  <button
                    onClick={() => deleteSkill(skill.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No skills added yet.
          </p>
        )}
      </div>

      {/* Experience Section */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Experience</h2>
          {canEdit && (
            <button
              onClick={() => {
                resetExpForm();
                setShowExpForm(!showExpForm);
              }}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              {showExpForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showExpForm ? "Cancel" : "Add Experience"}
            </button>
          )}
        </div>

        {showExpForm && (
          <div
            className="mb-4 rounded-md border p-4 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Company</label>
                <input
                  type="text"
                  value={expCompany}
                  onChange={(e) => setExpCompany(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={expStartDate}
                  onChange={(e) => setExpStartDate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={expEndDate}
                  onChange={(e) => setExpEndDate(e.target.value)}
                  disabled={expIsCurrent}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
                <label className="mt-1 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={expIsCurrent}
                    onChange={(e) => setExpIsCurrent(e.target.checked)}
                  />
                  Currently working here
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                style={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                }}
              />
            </div>
            <button
              onClick={saveExperience}
              disabled={!expCompany.trim() || !expTitle.trim() || !expStartDate}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Save className="h-4 w-4" />
              {editingExp ? "Update Experience" : "Add Experience"}
            </button>
          </div>
        )}

        {profile?.experiences && profile.experiences.length > 0 ? (
          <div className="space-y-4">
            {profile.experiences.map((exp) => (
              <div
                key={exp.id}
                className="rounded-md border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{exp.title}</h3>
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {exp.company}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                      {formatDate(exp.start_date)} - {exp.is_current ? "Present" : exp.end_date ? formatDate(exp.end_date) : "N/A"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openAiModal(exp)}
                        className="rounded p-1 transition-colors hover:bg-accent"
                        title="AI Assist"
                      >
                        <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                      </button>
                      <button
                        onClick={() => openEditExp(exp)}
                        className="rounded p-1 transition-colors hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                      </button>
                      <button
                        onClick={() => deleteExperience(exp.id)}
                        className="rounded p-1 transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--destructive)" }} />
                      </button>
                    </div>
                  )}
                </div>
                {exp.description && (
                  <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {exp.description}
                  </p>
                )}

              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No experience added yet.
          </p>
        )}
      </div>

      {/* Education Section */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Education</h2>
          {canEdit && (
            <button
              onClick={() => setShowEduForm(!showEduForm)}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              {showEduForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showEduForm ? "Cancel" : "Add Education"}
            </button>
          )}
        </div>

        {showEduForm && (
          <div
            className="mb-4 rounded-md border p-4 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Institution</label>
                <input
                  type="text"
                  value={eduInstitution}
                  onChange={(e) => setEduInstitution(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Degree</label>
                <input
                  type="text"
                  value={eduDegree}
                  onChange={(e) => setEduDegree(e.target.value)}
                  placeholder="e.g. Bachelor of Science"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Field of Study</label>
                <input
                  type="text"
                  value={eduField}
                  onChange={(e) => setEduField(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Graduation Date</label>
                <input
                  type="date"
                  value={eduGradDate}
                  onChange={(e) => setEduGradDate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
            </div>
            <button
              onClick={addEducation}
              disabled={!eduInstitution.trim() || !eduDegree.trim()}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus className="h-4 w-4" />
              Add Education
            </button>
          </div>
        )}

        {profile?.educations && profile.educations.length > 0 ? (
          <div className="space-y-4">
            {profile.educations.map((edu) => (
              <div
                key={edu.id}
                className="rounded-md border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{edu.degree}</h3>
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {edu.institution}
                    </p>
                    {edu.field_of_study && (
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {edu.field_of_study}
                      </p>
                    )}
                    {edu.graduation_date && (
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                        Graduated: {formatDate(edu.graduation_date)}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => deleteEducation(edu.id)}
                      className="rounded p-1 transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--destructive)" }} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No education added yet.
          </p>
        )}
      </div>

      {/* AI Experience Assistant Modal */}
      {aiModalExp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeAiModal(); }}
        >
          <div
            className="rounded-xl border shadow-2xl flex flex-col"
            style={{
              width: "95vw",
              height: "85vh",
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" style={{ color: "var(--primary)" }} />
                <div>
                  <h2 className="text-lg font-semibold">AI Experience Assistant</h2>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {aiModalExp.title} at {aiModalExp.company}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {aiPreviousDesc !== null && (
                  <button
                    onClick={undoApply}
                    disabled={applyingAi}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <Undo2 className="h-4 w-4" />
                    Undo
                  </button>
                )}
                {aiEnhanced.trim() && (
                  <button
                    onClick={applyEnhanced}
                    disabled={applyingAi}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                  >
                    {applyingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Apply Changes
                  </button>
                )}
                <button
                  onClick={closeAiModal}
                  className="rounded p-1.5 transition-colors hover:bg-accent"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - 3 Panels */}
            <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden">
              {/* Panel 1: Original */}
              <div
                className="flex flex-col border-r overflow-hidden"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="px-4 py-3 border-b font-medium text-sm flex items-center gap-2"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
                >
                  <FileText className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                  Original Description
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {aiModalExp.description ? (
                    <div className="text-sm">
                      <MarkdownContent content={aiModalExp.description} />
                    </div>
                  ) : (
                    <p className="text-sm italic" style={{ color: "var(--muted-foreground)" }}>
                      No description yet. Click &quot;Enhance&quot; to generate one, or use the chat to provide details about this role.
                    </p>
                  )}
                </div>
              </div>

              {/* Panel 2: Enhanced (editable) */}
              <div
                className="flex flex-col border-r overflow-hidden"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="px-4 py-3 border-b font-medium text-sm flex items-center justify-between"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" style={{ color: "var(--primary)" }} />
                    Enhanced Description
                  </div>
                  <div className="flex gap-1">
                    {aiEnhanced && (
                      <button
                        onClick={() => setAiEditing(!aiEditing)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-background"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Pencil className="h-3 w-3" />
                        {aiEditing ? "Preview" : "Edit"}
                      </button>
                    )}
                    {!aiEnhanced && !aiLoading && (
                      <button
                        onClick={() => handleAiEnhance(aiModalExp)}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                      >
                        <Sparkles className="h-3 w-3" />
                        Enhance
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {aiLoading && !aiEnhanced ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Enhancing your description...
                      </p>
                    </div>
                  ) : aiEnhanced && aiEditing ? (
                    <textarea
                      value={aiEnhanced}
                      onChange={(e) => setAiEnhanced(e.target.value)}
                      className="w-full h-full text-sm outline-none resize-none font-mono"
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--foreground)",
                      }}
                    />
                  ) : aiEnhanced ? (
                    <div className="text-sm">
                      <MarkdownContent content={aiEnhanced} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <Sparkles className="h-8 w-8" style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Click &quot;Enhance&quot; above to generate an improved version, or use the chat to ask questions first.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Panel 3: AI Chat */}
              <div className="flex flex-col overflow-hidden">
                <div
                  className="px-4 py-3 border-b font-medium text-sm flex items-center justify-between"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" style={{ color: "var(--primary)" }} />
                    AI Chat
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleAiAction(aiModalExp, "improve")}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-background disabled:opacity-50"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Lightbulb className="h-3 w-3" />
                      Tips
                    </button>
                    <button
                      onClick={() => handleAiAction(aiModalExp, "interview")}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-background disabled:opacity-50"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <HelpCircle className="h-3 w-3" />
                      Interview Q&apos;s
                    </button>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {aiHistory.length === 0 && !aiLoading && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <MessageSquare className="h-8 w-8" style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Ask the AI about this experience, request improvements, or get interview questions to surface accomplishments.
                      </p>
                    </div>
                  )}
                  {aiHistory.map((msg, idx) => (
                    <div key={idx}>
                      {msg.role === "user" ? (
                        <div className="flex justify-end">
                          <div
                            className="rounded-lg px-3 py-2 text-sm max-w-[85%]"
                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ) : hasDescription(msg.content) ? (
                        /* AI message containing a tagged description — show with visual distinction */
                        <div
                          className="rounded-lg border-2 p-3 text-sm"
                          style={{ backgroundColor: "var(--background)", borderColor: "var(--primary)" }}
                        >
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: "var(--border)" }}>
                            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                            <span className="text-xs font-semibold" style={{ color: "var(--primary)" }}>Revised Description Available</span>
                          </div>
                          <MarkdownContent content={getCommentary(msg.content)} />
                          <button
                            onClick={() => {
                              const desc = extractDescription(msg.content);
                              if (desc) {
                                setAiEnhanced(desc);
                                setAiEditing(false);
                              }
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                          >
                            <Sparkles className="h-3 w-3" />
                            Use as Enhanced Description
                          </button>
                        </div>
                      ) : (
                        /* Regular AI chat message */
                        <div
                          className="rounded-lg border p-3 text-sm"
                          style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                        >
                          <MarkdownContent content={msg.content} />
                        </div>
                      )}
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div
                  className="border-t p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiMessage}
                      onChange={(e) => setAiMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && aiMessage.trim() && !aiLoading) {
                          handleAiChat(aiModalExp, aiMessage);
                        }
                      }}
                      placeholder="Ask about this experience..."
                      disabled={aiLoading}
                      className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--background)",
                        borderColor: "var(--border)",
                      }}
                    />
                    <button
                      onClick={() => {
                        if (aiMessage.trim() && !aiLoading) {
                          handleAiChat(aiModalExp, aiMessage);
                        }
                      }}
                      disabled={aiLoading || !aiMessage.trim()}
                      className="rounded-md px-3 py-2 transition-colors disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--primary)",
                        color: "var(--primary-foreground)",
                      }}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Brand AI Advisor Modal (Headline / Summary) */}
      {brandField && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeBrandModal(); }}
        >
          <div
            className="rounded-xl border shadow-2xl flex flex-col"
            style={{
              width: "95vw",
              height: "85vh",
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5" style={{ color: "var(--primary)" }} />
                <div>
                  <h2 className="text-lg font-semibold">AI Brand Advisor</h2>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {brandField === "headline" ? "Professional Headline" : "Professional Summary"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {brandEnhanced.trim() && (
                  <button
                    onClick={applyBrandContent}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Apply Changes
                  </button>
                )}
                <button
                  onClick={closeBrandModal}
                  className="rounded p-1.5 transition-colors hover:bg-accent"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body - 3 Panels */}
            <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden">
              {/* Panel 1: Current Value */}
              <div
                className="flex flex-col border-r overflow-hidden"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="px-4 py-3 border-b font-medium text-sm flex items-center gap-2"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
                >
                  <FileText className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
                  Current {brandField === "headline" ? "Headline" : "Summary"}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {(brandField === "headline" ? headline : summary) ? (
                    <div className="text-sm">
                      <MarkdownContent content={brandField === "headline" ? headline : summary} />
                    </div>
                  ) : (
                    <p className="text-sm italic" style={{ color: "var(--muted-foreground)" }}>
                      No {brandField} yet. Click &quot;Generate&quot; to create one using your profile data.
                    </p>
                  )}
                </div>
              </div>

              {/* Panel 2: AI-Generated (editable) */}
              <div
                className="flex flex-col border-r overflow-hidden"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="px-4 py-3 border-b font-medium text-sm flex items-center justify-between"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" style={{ color: "var(--primary)" }} />
                    AI-Generated {brandField === "headline" ? "Headline" : "Summary"}
                  </div>
                  <div className="flex gap-1">
                    {brandEnhanced && (
                      <button
                        onClick={() => setBrandEditing(!brandEditing)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-background"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <Pencil className="h-3 w-3" />
                        {brandEditing ? "Preview" : "Edit"}
                      </button>
                    )}
                    {!brandEnhanced && !brandLoading && (
                      <button
                        onClick={() => handleBrandGenerate(brandField)}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                      >
                        <Sparkles className="h-3 w-3" />
                        Generate
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {brandLoading && !brandEnhanced ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Crafting your {brandField}...
                      </p>
                    </div>
                  ) : brandEnhanced && brandEditing ? (
                    <textarea
                      value={brandEnhanced}
                      onChange={(e) => setBrandEnhanced(e.target.value)}
                      className="w-full h-full text-sm outline-none resize-none font-mono"
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--foreground)",
                      }}
                    />
                  ) : brandEnhanced ? (
                    <div className="text-sm">
                      <MarkdownContent content={brandEnhanced} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <Sparkles className="h-8 w-8" style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Click &quot;Generate&quot; to create an AI-powered {brandField} based on your profile, or use the chat to guide the AI.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Panel 3: Chat with Brand Advisor */}
              <div className="flex flex-col overflow-hidden">
                <div
                  className="px-4 py-3 border-b font-medium text-sm flex items-center gap-2"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--accent)" }}
                >
                  <MessageSquare className="h-4 w-4" style={{ color: "var(--primary)" }} />
                  Chat with Brand Advisor
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {brandHistory.length === 0 && !brandLoading && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <MessageSquare className="h-8 w-8" style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                        {brandField === "headline"
                          ? "Ask the AI to refine your headline, emphasize certain skills, or target a specific industry."
                          : "Ask the AI to adjust tone, highlight specific achievements, or target a particular audience."}
                      </p>
                    </div>
                  )}
                  {brandHistory.map((msg, idx) => (
                    <div key={idx}>
                      {msg.role === "user" ? (
                        <div className="flex justify-end">
                          <div
                            className="rounded-lg px-3 py-2 text-sm max-w-[85%]"
                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="rounded-lg border p-3 text-sm"
                          style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                        >
                          <MarkdownContent content={msg.content} />
                        </div>
                      )}
                    </div>
                  ))}
                  {brandLoading && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div
                  className="border-t p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={brandMessage}
                      onChange={(e) => setBrandMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && brandMessage.trim() && !brandLoading && brandField) {
                          handleBrandChat(brandField, brandMessage);
                        }
                      }}
                      placeholder={`Refine your ${brandField}...`}
                      disabled={brandLoading}
                      className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--background)",
                        borderColor: "var(--border)",
                      }}
                    />
                    <button
                      onClick={() => {
                        if (brandMessage.trim() && !brandLoading && brandField) {
                          handleBrandChat(brandField, brandMessage);
                        }
                      }}
                      disabled={brandLoading || !brandMessage.trim()}
                      className="rounded-md px-3 py-2 transition-colors disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--primary)",
                        color: "var(--primary-foreground)",
                      }}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
