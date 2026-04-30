"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useBreadcrumbs } from "@/components/breadcrumbs";
import { type ColumnDef } from "@tanstack/react-table";
import { apiGet, apiPost, apiPut, apiDelete, apiDownload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRelative, formatDate } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
import { DataTableColumnHeader } from "@/components/data-table-column-header";
import { MarkdownContent } from "@/components/markdown-content";
import { ResumeChatDrawer } from "@/components/resume-chat-drawer";
import { PipelineStageIndicator } from "@/components/pipeline-stage-indicator";
import { InterviewJournal } from "@/components/interview-journal";
import { StoryBuilderDrawer, parseGapsFromArtifact } from "@/components/story-builder-drawer";
import type { ParsedGap } from "@/components/story-builder-drawer";
import type { ResumeChatAgent } from "@/lib/types";
import type {
  AgentConversation,
  AgentMessage,
  AgentWorkspace,
  Application,
  ApplicationFormField,
  ApplicationFormData,
  CompletenessCheckResult,
  BestFitReviewResult,
  DetectedMethodResult,
  ChatbotQuestionItem,
  ChatbotSimulationResult,
  ChatbotSubmitResult,
  EnrichedRequirement,
  JobListing,
  JobScrapeResult,
  DiscoverResult,
  PreflightResult,
  AgentTaskResult,
  PipelineRun,
  WorkspaceArtifact,
} from "@/lib/types";
import {
  Search,
  Scissors,
  GraduationCap,
  Target,
  Building,
  ClipboardList,
  MousePointerClick,
  Copy,
  ClipboardCheck,
  ArrowLeft,
  Send,
  Loader2,
  MessageSquare,
  ChevronLeft,
  Briefcase,
  Play,
  Zap,
  CheckCircle2,
  AlertCircle,
  Circle,
  FileText,
  ChevronRight,
  ChevronDown,
  Download,
  History,
  X,
  ClipboardCheck as ClipboardCheckIcon,
  Sparkles,
  Fingerprint,
  ShieldCheck,
  SendHorizonal,
  TriangleAlert,
  Flame,
  BarChart3,
  UserCheck,
  CalendarRange,
  Mail,
  Gavel,
  ShieldAlert,
  Mic,
  ExternalLink,
  Check,
  AlertTriangle,
  BookPlus,
  Plus,
  Globe,
  CheckCircle,
  Trash2,
} from "lucide-react";

const INTERVIEW_STAGES: { value: string; label: string }[] = [
  { value: "recruiter_screen", label: "Recruiter Screen" },
  { value: "phone_screen", label: "Phone Screen" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "technical", label: "Technical" },
  { value: "panel", label: "Panel" },
  { value: "final", label: "Final" },
];

interface AgentDef {
  name: string;
  key: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  description: string;
  modelTier: string;
  color: string;
}

const agents: AgentDef[] = [
  {
    name: "Scout",
    key: "scout",
    icon: Search,
    description: "Analyzes job listings against your profile, identifies matches, and discovers opportunities.",
    modelTier: "standard",
    color: "rgb(59,130,246)",
  },
  {
    name: "Tailor",
    key: "tailor",
    icon: Scissors,
    description: "Rewrites your resume and cover letter to match the job listing language authentically.",
    modelTier: "premium",
    color: "rgb(139,92,246)",
  },
  {
    name: "Achievement Amplifier",
    key: "achievement_amplifier",
    icon: Flame,
    description: "Strengthens every resume bullet into a high-impact statement backed by verified metrics.",
    modelTier: "standard",
    color: "rgb(220,38,38)",
  },
  {
    name: "ATS Predictor",
    key: "ats_predictor",
    icon: BarChart3,
    description: "Simulates ATS parsing to score your resume and identify missing keywords.",
    modelTier: "standard",
    color: "rgb(13,148,136)",
  },
  {
    name: "Hiring Manager",
    key: "hiring_manager_sim",
    icon: UserCheck,
    description: "Reviews your resume as if they were the hiring manager for this specific role.",
    modelTier: "standard",
    color: "rgb(124,58,237)",
  },
  {
    name: "Coach",
    key: "coach",
    icon: GraduationCap,
    description: "Prepares you for interviews with practice questions and feedback on your answers.",
    modelTier: "standard",
    color: "rgb(16,185,129)",
  },
  {
    name: "Talking Points",
    key: "talking_points",
    icon: MessageSquare,
    description: "Creates compelling interview stories for each bullet point in your tailored resume.",
    modelTier: "premium",
    color: "rgb(168,85,247)",
  },
  {
    name: "Strategist",
    key: "strategist",
    icon: Target,
    description: "Generates cover letters and develops application strategies with follow-up plans.",
    modelTier: "premium",
    color: "rgb(234,179,8)",
  },
  {
    name: "Brand Advisor",
    key: "brand_advisor",
    icon: Building,
    description: "Researches target companies and aligns your personal brand to their culture.",
    modelTier: "standard",
    color: "rgb(236,72,153)",
  },
  {
    name: "90-Day Plan",
    key: "ninety_day_plan",
    icon: CalendarRange,
    description: "Creates a 90-day onboarding plan showing how you'll create value from day one.",
    modelTier: "standard",
    color: "rgb(5,150,105)",
  },
  {
    name: "Outreach Drafter",
    key: "outreach_drafter",
    icon: Mail,
    description: "Drafts LinkedIn and email messages to reach the hiring manager directly.",
    modelTier: "standard",
    color: "rgb(217,119,6)",
  },
  {
    name: "Interview Prep Coach",
    key: "interview_prep_coach",
    icon: Mic,
    description: "Stage-tailored prep brief, flashcards, STAR drafts, and a mock-interview chat — drawn from your question bank, stories, and profile.",
    modelTier: "standard",
    color: "rgb(244,63,94)",
  },
  {
    name: "Coordinator",
    key: "coordinator",
    icon: ClipboardList,
    description: "Orchestrates the full application: checklists, timelines, and follow-up plans.",
    modelTier: "premium",
    color: "rgb(249,115,22)",
  },
  {
    name: "Auto-Fill",
    key: "auto_fill",
    icon: MousePointerClick,
    description: "Analyzes application forms and generates a browser auto-fill script for one-click form filling.",
    modelTier: "premium",
    color: "rgb(14,165,233)",
  },
];

const agentByKey = Object.fromEntries(agents.map((a) => [a.key, a]));

const tierBadge = (tier: string) => {
  const isP = tier === "premium";
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: isP ? "rgba(139,92,246,0.1)" : "rgba(59,130,246,0.1)",
        color: isP ? "rgb(124,58,237)" : "rgb(59,130,246)",
      }}
    >
      {isP ? "Premium" : "Standard"}
    </span>
  );
};

const statusIcon = (status: string) => {
  if (status === "ready") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "missing") return <AlertCircle className="h-4 w-4 text-red-500" />;
  return <Circle className="h-4 w-4 text-yellow-500" />;
};

type ViewMode = "chat" | "workspace";

export default function AgentsPage() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("workspace");
  const [autoLoadJobId, setAutoLoadJobId] = useState<string | null>(
    searchParams.get("job")
  );

  // Chat state
  const [activeAgent, setActiveAgent] = useState<AgentDef | null>(null);
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<AgentConversation | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showConvoSidebar, setShowConvoSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Identity Shield toggle (for Tailor agent -- ON by default)
  const [identityShield, setIdentityShield] = useState(true);

  // Ageism Shield toggle (for Tailor agent)
  const [ageismShield, setAgeismShield] = useState(true);

  // Overqualification Shield toggle (for Tailor agent)
  const [overqualificationShield, setOverqualificationShield] = useState(false);

  // Interview Prep Coach stage + notes
  const [interviewStage, setInterviewStage] = useState("recruiter_screen");
  const [interviewNotes, setInterviewNotes] = useState("");

  // Workspace state
  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<AgentWorkspace | null>(null);
  const [preflights, setPreflights] = useState<PreflightResult[]>([]);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [taskResult, setTaskResult] = useState<AgentTaskResult | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<WorkspaceArtifact | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [expandedHistoryKeys, setExpandedHistoryKeys] = useState<Set<string>>(new Set());
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const artifactViewerRef = useRef<HTMLDivElement>(null);

  // Resume coach chat drawer (per-agent, per-workspace)
  const [resumeChatAgent, setResumeChatAgent] = useState<ResumeChatAgent | null>(null);
  const [resumeChatToast, setResumeChatToast] = useState<string | null>(null);

  // Interview Verdict state
  const [verdictRunning, setVerdictRunning] = useState(false);
  const [verdictExpanded, setVerdictExpanded] = useState<Set<string>>(new Set());

  // Skill Gap Check state
  const [skillGapResults, setSkillGapResults] = useState<import("@/lib/types").EnrichedRequirement[] | null>(null);
  const [checkingSkillGaps, setCheckingSkillGaps] = useState(false);
  // Story Builder drawer state
  const [storyBuilderOpen, setStoryBuilderOpen] = useState(false);
  const [storyBuilderGaps, setStoryBuilderGaps] = useState<ParsedGap[]>([]);

  // Auto-Fill modal state
  const [showAutoFillModal, setShowAutoFillModal] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [autoFillJobTitle, setAutoFillJobTitle] = useState("");
  const [autoFillJobCompany, setAutoFillJobCompany] = useState("");
  const [detectedMethod, setDetectedMethod] = useState<string>("unknown");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  // Form mode state
  const [autoFillFields, setAutoFillFields] = useState<ApplicationFormField[]>([]);
  const [completenessResult, setCompletenessResult] = useState<CompletenessCheckResult | null>(null);
  const [bestFitResult, setBestFitResult] = useState<BestFitReviewResult | null>(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [bestFitLoading, setBestFitLoading] = useState(false);
  // Chatbot mode state
  const [chatbotQuestions, setChatbotQuestions] = useState<ChatbotQuestionItem[]>([]);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [editingAnswer, setEditingAnswer] = useState("");
  const [chatbotSubmitResult, setChatbotSubmitResult] = useState<ChatbotSubmitResult | null>(null);

  // Job creation state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addCompany, setAddCompany] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addLocation, setAddLocation] = useState("");
  const [addSource, setAddSource] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [showDiscover, setShowDiscover] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverLocation, setDiscoverLocation] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Navigation helpers
  const router = useRouter();
  const breadcrumbs = useBreadcrumbs();

  const canCreateJob = hasPermission("jobs", "create");
  const canDeleteJob = hasPermission("jobs", "delete");

  const backToJobPicker = useCallback(() => {
    setWorkspace(null);
    setSelectedAppId(null);
    setSelectedJob(null);
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const [jobs, apps] = await Promise.all([
        apiGet<JobListing[]>("/jobs"),
        apiGet<Application[]>("/applications"),
      ]);
      setJobListings(jobs);
      setApplications(apps);
    } catch { /* ignore */ }
  }, []);

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
    } catch {
      setScrapeError("Could not scrape this URL. You can still fill in the details manually.");
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
      setTimeout(() => scrapeUrl(pasted), 100);
    }
  }, [scrapeUrl]);

  const resetAddForm = useCallback(() => {
    setAddUrl("");
    setAddTitle("");
    setAddCompany("");
    setAddDescription("");
    setAddLocation("");
    setAddSource("");
    setAddNotes("");
    setScraped(false);
    setScrapeError("");
  }, []);

  const addJob = async () => {
    setAddSaving(true);
    try {
      const newJob = await apiPost<JobListing>("/jobs", {
        url: addUrl || null,
        title: addTitle || null,
        company: addCompany || null,
        description: addDescription || null,
        location: addLocation || null,
        source: addSource || "manual",
        notes: addNotes || null,
      });
      setShowAddModal(false);
      resetAddForm();
      setJobListings((prev) => [...prev, newJob]);
      loadWorkspace(newJob);
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
      const newJob = await apiPost<JobListing>("/jobs/import", { url: importUrl });
      setShowImportModal(false);
      setImportUrl("");
      setJobListings((prev) => [...prev, newJob]);
      loadWorkspace(newJob);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setImportError(message);
    } finally {
      setImporting(false);
    }
  };

  const runDiscover = async () => {
    setDiscovering(true);
    setDiscoverResult(null);
    setActiveSuggestionIdx(0);
    try {
      const result = await apiPost<DiscoverResult>("/jobs/discover", {
        query: discoverQuery,
        location: discoverLocation,
      });
      setDiscoverResult(result);
    } catch (err) {
      console.error("Discover failed:", err);
    } finally {
      setDiscovering(false);
    }
  };

  const updateBoardLinks = (keywords: string) => {
    if (!discoverResult) return;
    const kw = encodeURIComponent(keywords);
    const loc = discoverLocation ? encodeURIComponent(discoverLocation) : "";
    const links = [
      { board: "LinkedIn", url: loc ? `https://www.linkedin.com/jobs/search/?keywords=${kw}&location=${loc}` : `https://www.linkedin.com/jobs/search/?keywords=${kw}` },
      { board: "Indeed", url: loc ? `https://www.indeed.com/jobs?q=${kw}&l=${loc}` : `https://www.indeed.com/jobs?q=${kw}` },
      { board: "Glassdoor", url: loc ? `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${kw}&locKeyword=${loc}` : `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${kw}` },
      { board: "Google Jobs", url: `https://www.google.com/search?q=${kw}+jobs${loc ? `+${loc}` : ""}` },
    ];
    setDiscoverResult({ ...discoverResult, search_links: links });
  };

  const analyzeJob = async (id: string) => {
    setAnalyzingIds((prev) => new Set(prev).add(id));
    try {
      await apiPost(`/jobs/${id}/analyze`);
      await refreshJobs();
      if (selectedJob?.id === id) {
        const updated = await apiGet<JobListing>(`/jobs/${id}`);
        setSelectedJob(updated);
      }
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

  const deleteJob = async (job: JobListing) => {
    const confirmMsg =
      `Delete "${job.title}" at ${job.company}?\n\n` +
      `This also removes its application and every workspace artifact ` +
      `(tailored/amplified resumes, match analysis, etc.). This cannot be undone.`;
    if (!confirm(confirmMsg)) return;
    setDeletingIds((prev) => new Set(prev).add(job.id));
    try {
      await apiDelete(`/jobs/${job.id}`);
      setJobListings((prev) => prev.filter((j) => j.id !== job.id));
      if (selectedJob?.id === job.id) backToJobPicker();
    } catch (err) {
      console.error("Failed to delete job:", err);
      alert(err instanceof Error ? `Delete failed: ${err.message}` : "Delete failed. Please try again.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  useEffect(() => {
    if (selectedJob && workspace) {
      const jobLabel = `${selectedJob.title} at ${selectedJob.company}`;
      breadcrumbs.set([
        { label: "Application Studio", onClick: backToJobPicker },
        { label: jobLabel },
      ]);
    } else {
      breadcrumbs.set([{ label: "Application Studio" }]);
    }
  }, [selectedJob, workspace, breadcrumbs, backToJobPicker]);

  useEffect(() => {
    return () => breadcrumbs.clear();
  }, [breadcrumbs]);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === "/agents") backToJobPicker();
    };
    window.addEventListener("sidebar-nav-reset", handler);
    return () => window.removeEventListener("sidebar-nav-reset", handler);
  }, [backToJobPicker]);

  // Scroll to artifact viewer when an artifact is selected; clear any prior download error
  useEffect(() => {
    setDownloadError(null);
    if (selectedArtifact && artifactViewerRef.current) {
      artifactViewerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedArtifact]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await apiDownload("/applications/export?format=csv", `applications_${today}.csv`);
    } catch {
      // silent — apiDownload throws on failure
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async (format: "pdf" | "docx") => {
    if (!workspace || !selectedArtifact) return;
    setDownloadError(null);
    setDownloading(format);
    try {
      await apiDownload(
        `/agents/workspaces/${workspace.id}/artifacts/${selectedArtifact.id}/export?format=${format}`,
        `${selectedArtifact.title.replace(/\s+/g, "_")}.${format}`,
      );
    } catch {
      setDownloadError(`Failed to download as ${format.toUpperCase()}. Please try again.`);
    } finally {
      setDownloading(null);
    }
  };

  const toggleHistory = (key: string) => {
    setExpandedHistoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Group artifacts by (agent_name, artifact_type), sorted newest first within each group. */
  const groupArtifacts = (artifacts: WorkspaceArtifact[]) => {
    const groups = new Map<string, WorkspaceArtifact[]>();
    for (const art of artifacts) {
      const key = `${art.agent_name}::${art.artifact_type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(art);
    }
    // Sort each group by version descending (newest first)
    for (const [, arts] of groups) {
      arts.sort((a, b) => b.version - a.version);
    }
    return groups;
  };

  // ─── Interview Verdict helpers ────────────────────────────────────
  interface VerdictEntry {
    agent: string;
    agent_label: string;
    vote: string;
    confidence: number;
    reasoning: string;
    key_factor: string;
  }
  interface CaptainVerdict {
    decision: string;
    confidence: number;
    headline: string;
    intangibles: string[];
    what_others_missed: string;
    strategic_advice: string;
  }
  interface VerdictData {
    verdicts: VerdictEntry[];
    captain: CaptainVerdict;
    summary: { interview_votes: number; pass_votes: number; total_agents: number; overall_sentiment: string };
  }

  const getVerdictData = useCallback((): VerdictData | null => {
    if (!workspace) return null;
    const art = workspace.artifacts
      .filter((a) => a.artifact_type === "agent_verdicts" && a.agent_name === "interview_verdict")
      .sort((a, b) => b.version - a.version)[0];
    if (!art) return null;
    try {
      return JSON.parse(art.content) as VerdictData;
    } catch {
      return null;
    }
  }, [workspace]);

  const getNarrativeArtifact = useCallback((): WorkspaceArtifact | null => {
    if (!workspace) return null;
    return workspace.artifacts
      .filter((a) => a.artifact_type === "interview_verdict" && a.agent_name === "interview_verdict")
      .sort((a, b) => b.version - a.version)[0] || null;
  }, [workspace]);

  const voteColor = (vote: string) => {
    const colors: Record<string, string> = {
      strong_interview: "rgb(5,150,105)",
      interview: "rgb(16,185,129)",
      lean_interview: "rgb(13,148,136)",
      lean_pass: "rgb(217,119,6)",
      pass: "rgb(239,68,68)",
      strong_pass: "rgb(185,28,28)",
    };
    return colors[vote] || "rgb(107,114,128)";
  };

  const voteBg = (vote: string) => {
    const bgs: Record<string, string> = {
      strong_interview: "rgba(5,150,105,0.1)",
      interview: "rgba(16,185,129,0.1)",
      lean_interview: "rgba(13,148,136,0.1)",
      lean_pass: "rgba(217,119,6,0.1)",
      pass: "rgba(239,68,68,0.1)",
      strong_pass: "rgba(185,28,28,0.1)",
    };
    return bgs[vote] || "rgba(107,114,128,0.1)";
  };

  const voteLabel = (vote: string) =>
    vote.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const isInterviewVote = (vote: string) =>
    vote === "strong_interview" || vote === "interview" || vote === "lean_interview";

  const toggleVerdictExpand = (agent: string) => {
    setVerdictExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agent)) next.delete(agent);
      else next.add(agent);
      return next;
    });
  };

  const runVerdict = async () => {
    if (!workspace || !selectedAppId) return;
    setVerdictRunning(true);
    try {
      const result = await apiPost<AgentTaskResult>(
        `/agents/workspaces/${workspace.id}/run-agent`,
        { agent_name: "interview_verdict", additional_instructions: null, ageism_shield: false }
      );
      // Reload workspace to pick up new artifacts
      const updated = await apiGet<AgentWorkspace>(`/agents/workspaces/${workspace.id}`);
      setWorkspace(updated);
      setTaskResult(result);
    } catch (err) {
      console.error("Verdict failed:", err);
    } finally {
      setVerdictRunning(false);
    }
  };

  const canWorkspace = hasPermission("workspace", "create") || hasPermission("workspace", "view");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load job listings and applications for workspace mode
  useEffect(() => {
    if (viewMode === "workspace" && jobListings.length === 0) {
      Promise.all([
        apiGet<JobListing[]>("/jobs"),
        apiGet<Application[]>("/applications"),
      ])
        .then(([jobs, apps]) => {
          setJobListings(jobs);
          setApplications(apps);
        })
        .catch(() => {
          setJobListings([]);
          setApplications([]);
        });
    }
  }, [viewMode, jobListings.length]);

  // Auto-load workspace when navigated from Job Listings with ?job=id
  useEffect(() => {
    if (autoLoadJobId && jobListings.length > 0 && !workspace) {
      const job = jobListings.find((j) => j.id === autoLoadJobId);
      if (job) {
        setAutoLoadJobId(null);
        window.history.replaceState({}, '', '/agents');
        loadWorkspace(job);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadJobId, jobListings, workspace]);

  useEffect(() => {
    if (!resumeChatToast) return;
    const t = setTimeout(() => setResumeChatToast(null), 6000);
    return () => clearTimeout(t);
  }, [resumeChatToast]);

  // --- Chat functions ---

  const fetchConversations = useCallback(async (agentName: string) => {
    setLoadingConvos(true);
    try {
      const data = await apiGet<AgentConversation[]>(`/agents/${agentName.toLowerCase()}/conversations`);
      setConversations(data);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConvos(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const data = await apiGet<AgentMessage[]>(`/agents/conversations/${conversationId}/messages`);
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const openConversation = async (convo: AgentConversation) => {
    setActiveConversation(convo);
    await fetchMessages(convo.id);
  };

  const startNewConversation = async () => {
    if (!activeAgent) return;
    try {
      const convo = await apiPost<AgentConversation>(
        `/agents/${activeAgent.key}/conversations`,
        { context_type: "general" },
      );
      setActiveConversation(convo);
      setMessages([]);
      await fetchConversations(activeAgent.key);
    } catch (err) {
      console.error("Failed to start conversation:", err);
    }
  };

  const sendMessage = async () => {
    if (!activeConversation || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    const tempMsg: AgentMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversation.id,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const response = await apiPost<{ user_message: AgentMessage; assistant_message: AgentMessage }>(
        `/agents/conversations/${activeConversation.id}/messages`,
        { content: text },
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempMsg.id),
        response.user_message,
        response.assistant_message,
      ]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  // --- Workspace chat (scoped to application) ---

  const chatWithAgent = async (agent: AgentDef) => {
    if (!selectedAppId) return;
    // Tailor / Achievement Amplifier open the resume coach drawer instead of
    // a generic agent chat. Drawer only opens if the agent has produced a
    // resume artifact already; otherwise toast the user to run it first.
    if (agent.key === "tailor" || agent.key === "achievement_amplifier") {
      if (!workspace) {
        setResumeChatToast(
          "Open a job workspace first, then click Chat again.",
        );
        return;
      }
      try {
        const resp = await apiPost<{ exists: boolean }>(
          "/resume-chat/latest-exists",
          { agent_name: agent.key, workspace_id: workspace.id },
        );
        console.log("[resume-chat] preflight", agent.key, "→", resp);
        if (!resp.exists) {
          setResumeChatToast(
            `Run ${agent.name} first — there's no ${agent.key === "tailor" ? "tailored" : "amplified"} resume in this workspace yet.`,
          );
          return;
        }
        setResumeChatAgent(agent.key as ResumeChatAgent);
      } catch (err) {
        console.error("[resume-chat] preflight failed", err);
        setResumeChatToast(
          "Couldn't open the resume coach. Try again in a moment.",
        );
      }
      return;
    }
    try {
      const convo = await apiPost<AgentConversation>(
        `/agents/${agent.key}/conversations`,
        { context_type: "general", context_id: selectedAppId },
      );
      setActiveAgent(agent);
      setActiveConversation(convo);
      setMessages([]);
      await fetchConversations(agent.key);
      setViewMode("chat");
    } catch (err) {
      console.error("Failed to start scoped conversation:", err);
    }
  };

  // --- Workspace functions ---

  const loadWorkspace = async (job: JobListing) => {
    setSelectedJob(job);
    setLoadingWorkspace(true);
    setWorkspace(null);
    setPreflights([]);
    setTaskResult(null);
    setSelectedArtifact(null);
    setSkillGapResults(null);
    setStoryBuilderOpen(false);
    setStoryBuilderGaps([]);

    try {
      // Find existing application or create one
      let app = applications.find((a) => a.job_listing_id === job.id);
      if (!app) {
        try {
          app = await apiPost<Application>("/applications", {
            job_listing_id: job.id,
            status: "draft",
          });
          setApplications((prev) => [...prev, app!]);
        } catch (err: unknown) {
          // 409 = application already exists, fetch all and find it
          const freshApps = await apiGet<Application[]>("/applications");
          setApplications(freshApps);
          app = freshApps.find((a) => a.job_listing_id === job.id);
          if (!app) throw err;
        }
      }

      setSelectedAppId(app.id);

      // Create or get workspace
      const ws = await apiPost<AgentWorkspace>("/agents/workspaces", { application_id: app.id });
      setWorkspace(ws);

      // Load preflights for all agents
      const pf = await apiGet<PreflightResult[]>(`/agents/preflight/all/${app.id}`);
      setPreflights(pf);

      // Restore persisted skill gap results from latest artifact
      const sgArtifact = ws.artifacts
        ?.filter((a: WorkspaceArtifact) => a.artifact_type === "skill_gap_check")
        .sort((a: WorkspaceArtifact, b: WorkspaceArtifact) => b.version - a.version)[0];
      if (sgArtifact) {
        try {
          setSkillGapResults(JSON.parse(sgArtifact.content));
        } catch { /* ignore parse errors */ }
      }
    } catch (err) {
      console.error("Failed to load workspace:", err);
    } finally {
      setLoadingWorkspace(false);
    }
  };

  const runAgent = async (agentName: string) => {
    if (!workspace) return;
    setRunningAgent(agentName);
    setTaskResult(null);
    try {
      const body: Record<string, unknown> = { agent_name: agentName };
      if (agentName === "tailor") {
        body.identity_shield = identityShield;
        if (ageismShield) body.ageism_shield = true;
        if (overqualificationShield) body.overqualification_shield = true;
      }
      if (agentName === "interview_prep_coach") {
        const notes = interviewNotes.trim();
        body.additional_instructions = notes
          ? `Stage: ${interviewStage}\n\n${notes}`
          : `Stage: ${interviewStage}`;
      }
      const result = await apiPost<AgentTaskResult>(
        `/agents/workspaces/${workspace.id}/run-agent`,
        body,
      );
      setTaskResult(result);

      // Refresh workspace to get new artifacts
      const ws = await apiGet<AgentWorkspace>(`/agents/workspaces/${workspace.id}`);
      setWorkspace(ws);

      // Refresh preflights
      if (selectedAppId) {
        const pf = await apiGet<PreflightResult[]>(`/agents/preflight/all/${selectedAppId}`);
        setPreflights(pf);
      }
    } catch (err) {
      console.error("Agent run failed:", err);
    } finally {
      setRunningAgent(null);
    }
  };

  const checkSkillGaps = async () => {
    if (!workspace) return;
    setCheckingSkillGaps(true);
    setSkillGapResults(null);
    try {
      const result = await apiPost<{ artifact_id: string; requirements: EnrichedRequirement[] }>(
        `/agents/workspaces/${workspace.id}/check-skill-gaps`,
        {},
      );
      setSkillGapResults(result.requirements);
      // Refresh workspace so the artifact shows up in the list
      const ws = await apiGet<AgentWorkspace>(`/agents/workspaces/${workspace.id}`);
      setWorkspace(ws);
    } catch (err) {
      console.error("Skill gap check failed:", err);
    } finally {
      setCheckingSkillGaps(false);
    }
  };

  const runPipeline = async (type: "full" | "quick") => {
    if (!workspace) return;
    setPipelineRunning(true);
    setTaskResult(null);
    try {
      await apiPost<PipelineRun>(
        `/agents/workspaces/${workspace.id}/pipeline`,
        { pipeline_type: type },
      );

      // Refresh workspace
      const ws = await apiGet<AgentWorkspace>(`/agents/workspaces/${workspace.id}`);
      setWorkspace(ws);

      // Refresh preflights
      if (selectedAppId) {
        const pf = await apiGet<PreflightResult[]>(`/agents/preflight/all/${selectedAppId}`);
        setPreflights(pf);
      }
    } catch (err) {
      console.error("Pipeline failed:", err);
    } finally {
      setPipelineRunning(false);
    }
  };

  // --- Auto-Fill modal functions ---

  const openAutoFillModal = async () => {
    if (!workspace) return;
    setShowAutoFillModal(true);
    setAutoFillLoading(true);
    setAutoFillFields([]);
    setChatbotQuestions([]);
    setActiveQuestionIdx(0);
    setCompletenessResult(null);
    setBestFitResult(null);
    setChatbotSubmitResult(null);
    setSubmitSuccess(false);
    setDetectedMethod("unknown");

    try {
      // Step 1: Detect application method
      const detection = await apiPost<DetectedMethodResult>(
        `/agents/workspaces/${workspace.id}/detect-method`,
      );
      setAutoFillJobTitle(detection.job_title);
      setAutoFillJobCompany(detection.job_company);
      setDetectedMethod(detection.method);

      if (detection.method === "chatbot") {
        // Step 2a: Simulate chatbot — collect questions + AI suggestions
        const sim = await apiPost<ChatbotSimulationResult>(
          `/agents/workspaces/${workspace.id}/simulate-chatbot`,
        );
        const withDefaults = sim.questions.map((q) => ({
          ...q,
          approved_answer: q.suggested_answer,
          status: "pending" as string,
        }));
        setChatbotQuestions(withDefaults);
        if (withDefaults.length > 0) {
          setEditingAnswer(withDefaults[0].suggested_answer);
        }
      } else {
        // Step 2b: Generate traditional form
        const data = await apiPost<ApplicationFormData>(
          `/agents/workspaces/${workspace.id}/generate-application-form`,
        );
        setAutoFillFields(data.fields);
      }
    } catch (err) {
      console.error("Failed to load auto-fill modal:", err);
    } finally {
      setAutoFillLoading(false);
    }
  };

  // --- Chatbot mode functions ---

  const acceptAnswer = () => {
    setChatbotQuestions((prev) =>
      prev.map((q, i) =>
        i === activeQuestionIdx
          ? { ...q, approved_answer: editingAnswer, status: "accepted" }
          : q,
      ),
    );
    advanceQuestion();
  };

  const editAnswer = () => {
    setChatbotQuestions((prev) =>
      prev.map((q, i) =>
        i === activeQuestionIdx
          ? { ...q, approved_answer: editingAnswer, status: "edited" }
          : q,
      ),
    );
    advanceQuestion();
  };

  const skipAnswer = () => {
    setChatbotQuestions((prev) =>
      prev.map((q, i) =>
        i === activeQuestionIdx
          ? { ...q, approved_answer: "", status: "skipped" }
          : q,
      ),
    );
    advanceQuestion();
  };

  const advanceQuestion = () => {
    const next = activeQuestionIdx + 1;
    if (next < chatbotQuestions.length) {
      setActiveQuestionIdx(next);
      setEditingAnswer(chatbotQuestions[next].suggested_answer);
    }
  };

  const goToQuestion = (idx: number) => {
    setActiveQuestionIdx(idx);
    setEditingAnswer(chatbotQuestions[idx].approved_answer || chatbotQuestions[idx].suggested_answer);
  };

  const allQuestionsReviewed = chatbotQuestions.length > 0 && chatbotQuestions.every((q) => q.status !== "pending");

  const submitChatbot = async () => {
    if (!workspace) return;
    setSubmitting(true);
    try {
      const result = await apiPost<ChatbotSubmitResult>(
        `/agents/workspaces/${workspace.id}/submit-chatbot`,
        { answers: chatbotQuestions },
      );
      setChatbotSubmitResult(result);
      if (result.completed) {
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedAppId ? { ...a, status: "submitted" } : a)),
        );
        setSubmitSuccess(true);
      }
    } catch (err) {
      console.error("Chatbot submission failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Form mode functions ---

  const updateFormField = (key: string, value: string) => {
    setAutoFillFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f)),
    );
    setCompletenessResult(null);
    setBestFitResult(null);
  };

  const runCompletenessCheck = async () => {
    if (!workspace) return;
    setCompletenessLoading(true);
    setCompletenessResult(null);
    try {
      const result = await apiPost<CompletenessCheckResult>(
        `/agents/workspaces/${workspace.id}/check-completeness`,
        { fields: autoFillFields },
      );
      setCompletenessResult(result);
    } catch (err) {
      console.error("Completeness check failed:", err);
    } finally {
      setCompletenessLoading(false);
    }
  };

  const runBestFitReview = async () => {
    if (!workspace) return;
    setBestFitLoading(true);
    setBestFitResult(null);
    try {
      const result = await apiPost<BestFitReviewResult>(
        `/agents/workspaces/${workspace.id}/best-fit-review`,
        { fields: autoFillFields },
      );
      setBestFitResult(result);
    } catch (err) {
      console.error("Best-fit review failed:", err);
    } finally {
      setBestFitLoading(false);
    }
  };

  const submitFormApplication = async () => {
    if (!selectedAppId) return;
    setSubmitting(true);
    try {
      await apiPut(`/applications/${selectedAppId}/status`, { status: "submitted" });
      setApplications((prev) =>
        prev.map((a) => (a.id === selectedAppId ? { ...a, status: "submitted" } : a)),
      );
      setSubmitSuccess(true);
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Workspace view (main landing) ─────────────────────────────────

  const jobStatusColors: Record<string, { bg: string; text: string }> = {
    new: { bg: "rgba(59,130,246,0.1)", text: "rgb(59,130,246)" },
    analyzing: { bg: "rgba(234,179,8,0.1)", text: "rgb(161,98,7)" },
    analyzed: { bg: "rgba(16,185,129,0.1)", text: "rgb(5,150,105)" },
    applied: { bg: "rgba(139,92,246,0.1)", text: "rgb(124,58,237)" },
    archived: { bg: "rgba(107,114,128,0.1)", text: "rgb(107,114,128)" },
  };

  const jobPickerColumns = useMemo<ColumnDef<JobListing, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Title" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("title") || "Untitled"}</span>
        ),
      },
      {
        accessorKey: "company",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Company" />
        ),
        cell: ({ row }) => row.getValue("company") || "Unknown",
      },
      {
        accessorKey: "location",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Location" />
        ),
        cell: ({ row }) => {
          const loc = row.getValue("location") as string | null;
          return loc || <span style={{ color: "var(--muted-foreground)" }}>--</span>;
        },
      },
      {
        accessorKey: "priority",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Priority" />
        ),
        cell: ({ row }) => {
          const job = row.original;
          const val = job.priority;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="number"
                min={1}
                value={val ?? ""}
                placeholder="—"
                className="w-12 rounded border bg-transparent px-1.5 py-0.5 text-center text-xs tabular-nums focus:ring-1 focus:ring-primary"
                onBlur={async (e) => {
                  const newVal = e.target.value ? parseInt(e.target.value, 10) : null;
                  if (newVal === val) return;
                  try {
                    await apiPut(`/jobs/${job.id}/priority`, { priority: newVal });
                    setJobListings((prev) =>
                      prev.map((j) => (j.id === job.id ? { ...j, priority: newVal } : j)),
                    );
                  } catch { /* ignore */ }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          );
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.priority;
          const b = rowB.original.priority;
          if (a == null && b == null) return 0;
          if (a == null) return 1;
          if (b == null) return -1;
          return a - b;
        },
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
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.getValue("status") as string;
          const colors = jobStatusColors[status] || jobStatusColors.new;
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
        id: "application",
        header: "Application",
        cell: ({ row }) => {
          const existingApp = applications.find(
            (a) => a.job_listing_id === row.original.id,
          );
          return existingApp ? (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "rgb(5,150,105)" }}
            >
              Started
            </span>
          ) : (
            <span style={{ color: "var(--muted-foreground)" }}>--</span>
          );
        },
      },
      {
        id: "pipeline_stage",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Stage" />
        ),
        cell: ({ row }) => {
          const existingApp = applications.find(
            (a) => a.job_listing_id === row.original.id,
          );
          if (!existingApp) return <span style={{ color: "var(--muted-foreground)" }}>--</span>;
          const stage = existingApp.pipeline_stage || "tbat";
          const stageColors: Record<string, { bg: string; text: string }> = {
            tbat: { bg: "rgba(156,163,175,0.15)", text: "rgb(107,114,128)" },
            applied: { bg: "rgba(59,130,246,0.1)", text: "rgb(37,99,235)" },
            recruiter_interview: { bg: "rgba(168,85,247,0.1)", text: "rgb(147,51,234)" },
            hr_interview: { bg: "rgba(168,85,247,0.1)", text: "rgb(147,51,234)" },
            technical_interview: { bg: "rgba(249,115,22,0.1)", text: "rgb(234,88,12)" },
            hiring_manager_interview: { bg: "rgba(249,115,22,0.1)", text: "rgb(234,88,12)" },
            panel_interview: { bg: "rgba(239,68,68,0.1)", text: "rgb(220,38,38)" },
            offer: { bg: "rgba(16,185,129,0.1)", text: "rgb(5,150,105)" },
            negotiation: { bg: "rgba(16,185,129,0.1)", text: "rgb(5,150,105)" },
            accepted: { bg: "rgba(16,185,129,0.2)", text: "rgb(4,120,87)" },
            rejected: { bg: "rgba(239,68,68,0.1)", text: "rgb(185,28,28)" },
            withdrawn: { bg: "rgba(234,179,8,0.1)", text: "rgb(161,98,7)" },
          };
          const colors = stageColors[stage] || stageColors.tbat;
          return (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {stage.replace(/_/g, " ")}
            </span>
          );
        },
        filterFn: (row, _columnId, filterValue: string[]) => {
          const existingApp = applications.find(
            (a) => a.job_listing_id === row.original.id,
          );
          const stage = existingApp?.pipeline_stage || "tbat";
          return filterValue.includes(stage);
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
              {canDeleteJob && (
                <button
                  onClick={() => deleteJob(job)}
                  disabled={deletingIds.has(job.id)}
                  className="inline-flex items-center rounded-md p-1 transition-colors hover:bg-red-50 disabled:opacity-50"
                  style={{ color: "rgb(220,38,38)" }}
                  title="Delete job"
                >
                  {deletingIds.has(job.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [applications, analyzingIds, deletingIds, canDeleteJob],
  );

  const resumeChatOverlays = (
    <>
      {resumeChatAgent && workspace && (
        <ResumeChatDrawer
          open={true}
          onClose={() => setResumeChatAgent(null)}
          agent={resumeChatAgent}
          workspaceId={workspace.id}
          onPublished={() => {
            if (selectedJob) loadWorkspace(selectedJob);
          }}
        />
      )}
      {resumeChatToast && (
        <div
          className="fixed left-1/2 top-6 z-[100] w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border-2 px-5 py-4 text-sm shadow-2xl"
          style={{
            backgroundColor: "rgb(254,243,199)",
            borderColor: "rgb(217,119,6)",
            color: "rgb(120,53,15)",
          }}
          role="status"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ color: "rgb(217,119,6)" }}
            />
            <div className="flex-1">
              <p className="font-semibold leading-snug">Heads up</p>
              <p className="mt-0.5 leading-snug">{resumeChatToast}</p>
            </div>
            <button
              type="button"
              onClick={() => setResumeChatToast(null)}
              className="shrink-0 rounded-md px-1 py-0.5 text-xs hover:bg-amber-200"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  const storyBuilderOverlay = storyBuilderOpen && (
    <StoryBuilderDrawer
      open={true}
      onClose={() => {
        setStoryBuilderOpen(false);
        setStoryBuilderGaps([]);
      }}
      gaps={storyBuilderGaps.length > 0 ? storyBuilderGaps : undefined}
      onSaved={() => {
        setStoryBuilderOpen(false);
        setStoryBuilderGaps([]);
      }}
    />
  );

  if (viewMode === "workspace") {
    return (
      <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Application Studio</h1>
            <p style={{ color: "var(--muted-foreground)" }}>
              Add a job listing and let AI agents craft your application — tailored resume, cover letter, interview prep, and more.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!workspace && canCreateJob && (
              <>
                <button
                  onClick={() => setShowDiscover(!showDiscover)}
                  className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  style={{
                    borderColor: showDiscover ? "var(--primary)" : "var(--border)",
                    color: showDiscover ? "var(--primary)" : undefined,
                  }}
                >
                  <Search className="h-4 w-4" />
                  Discover Jobs
                </button>
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
              </>
            )}
            {applications.length > 0 && (
              <button
                onClick={handleExportCsv}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
                title="Export all applications as CSV"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Export CSV
              </button>
            )}
          </div>
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
                  <label className="block text-sm font-medium mb-1">Job URL <span className="text-muted-foreground font-normal">(optional for recruiter/referral)</span></label>
                  <div className="relative">
                    <input
                      type="url"
                      value={addUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      onBlur={handleUrlBlur}
                      onPaste={handleUrlPaste}
                      placeholder="Paste a job listing URL to auto-fill details..."
                      className="w-full rounded-md border px-3 py-2 pr-10 text-sm outline-none focus:ring-1 focus:ring-ring"
                      style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
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
                    style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
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
                      style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Location</label>
                    <input
                      type="text"
                      value={addLocation}
                      onChange={(e) => setAddLocation(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                      style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Source</label>
                  <select
                    value={addSource}
                    onChange={(e) => setAddSource(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                  >
                    <option value="">Manual</option>
                    <option value="recruiter">Recruiter</option>
                    <option value="referral">Referral</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="indeed">Indeed</option>
                    <option value="glassdoor">Glassdoor</option>
                    <option value="company_site">Company Site</option>
                  </select>
                </div>
                {addDescription && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Description (scraped)</label>
                    <textarea
                      value={addDescription}
                      onChange={(e) => setAddDescription(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-y"
                      style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. Recruiter name, scheduling link, context..."
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-y"
                    style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
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
                    disabled={(!addUrl.trim() && (!addTitle.trim() || !addCompany.trim())) || addSaving || scraping}
                    className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
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
                      style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
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
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Import
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Discover Jobs Panel */}
        {!workspace && showDiscover && (
          <div
            className="rounded-xl border p-6"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Search className="h-4 w-4" style={{ color: "var(--primary)" }} />
              <h2 className="font-semibold">Discover Jobs</h2>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                AI-powered search suggestions based on your profile
              </span>
            </div>
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={discoverQuery}
                onChange={(e) => setDiscoverQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runDiscover()}
                placeholder="Job title, keywords, or skills..."
                className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
              />
              <input
                type="text"
                value={discoverLocation}
                onChange={(e) => setDiscoverLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runDiscover()}
                placeholder="Location (optional)"
                className="w-48 rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
              />
              <button
                onClick={runDiscover}
                disabled={discovering}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>
            {discovering && (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--primary)" }} />
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Generating search suggestions from your profile...
                </span>
              </div>
            )}
            {discoverResult && !discovering && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Search Strategies</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {discoverResult.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setActiveSuggestionIdx(i);
                          updateBoardLinks(s.keywords);
                        }}
                        className={`text-left rounded-lg border p-3 transition-colors ${
                          i === activeSuggestionIdx ? "ring-1 ring-ring" : "hover:bg-accent/50"
                        }`}
                        style={{
                          borderColor: i === activeSuggestionIdx ? "var(--primary)" : "var(--border)",
                          backgroundColor: i === activeSuggestionIdx ? "rgba(59,130,246,0.05)" : undefined,
                        }}
                      >
                        <p className="font-medium text-sm">{s.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                          {s.rationale}
                        </p>
                        <p className="text-xs mt-1 font-mono" style={{ color: "var(--primary)" }}>
                          {s.keywords}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2">Search on Job Boards</h3>
                  <div className="flex flex-wrap gap-2">
                    {discoverResult.search_links.map((link) => (
                      <a
                        key={link.board}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {link.board}
                      </a>
                    ))}
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                    Found a job? Use &quot;Import from URL&quot; above to add it.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Job listing selector */}
        {!workspace && (
          <div
            className="rounded-xl border p-6"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2 className="font-semibold mb-4">Job Listings</h2>
            {jobListings.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                No job listings yet. Add one above to get started.
              </p>
            ) : (
              <DataTable
                columns={jobPickerColumns}
                data={jobListings}
                searchKey="title"
                searchPlaceholder="Search jobs..."
                filterableColumns={[
                  {
                    id: "status",
                    title: "Status",
                    options: [
                      { label: "New", value: "new" },
                      { label: "Analyzing", value: "analyzing" },
                      { label: "Analyzed", value: "analyzed" },
                      { label: "Applied", value: "applied" },
                      { label: "Archived", value: "archived" },
                    ],
                  },
                  {
                    id: "pipeline_stage",
                    title: "Stage",
                    options: [
                      { label: "TBAT", value: "tbat" },
                      { label: "Applied", value: "applied" },
                      { label: "Recruiter", value: "recruiter_interview" },
                      { label: "HR", value: "hr_interview" },
                      { label: "Technical", value: "technical_interview" },
                      { label: "Hiring Mgr", value: "hiring_manager_interview" },
                      { label: "Panel", value: "panel_interview" },
                      { label: "Offer", value: "offer" },
                      { label: "Negotiation", value: "negotiation" },
                      { label: "Accepted", value: "accepted" },
                      { label: "Rejected", value: "rejected" },
                      { label: "Withdrawn", value: "withdrawn" },
                    ],
                  },
                ]}
                storageKey="studio-job-picker"
                onRowClick={(job) => loadWorkspace(job)}
              />
            )}
          </div>
        )}

        {loadingWorkspace && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--primary)" }} />
          </div>
        )}

        {workspace && (() => {
          const currentApp = applications.find((a) => a.id === selectedAppId);
          return (
          <>
            {/* Application context banner */}
            {selectedJob && (
              <div
                className="rounded-xl border p-5 flex items-center gap-4"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--primary)",
                  borderWidth: "2px",
                }}
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg shrink-0"
                  style={{ backgroundColor: "rgba(var(--primary-rgb, 59,130,246), 0.1)" }}
                >
                  <Briefcase className="h-6 w-6" style={{ color: "var(--primary)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-lg truncate">
                    {selectedJob.title || "Untitled Position"}
                  </h2>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {selectedJob.company || "Unknown Company"}
                    {selectedJob.match_score !== null && (
                      <span className="ml-2">Match: {selectedJob.match_score}%</span>
                    )}
                  </p>
                  {currentApp && (
                    <div className="mt-1.5">
                      <PipelineStageIndicator
                        currentStage={currentApp.pipeline_stage || "tbat"}
                        onStageChange={async (stage) => {
                          try {
                            await apiPut(`/applications/${currentApp.id}/pipeline-stage`, { pipeline_stage: stage });
                            setApplications((prev) =>
                              prev.map((a) =>
                                a.id === currentApp.id
                                  ? { ...a, pipeline_stage: stage, pipeline_stage_updated_at: new Date().toISOString() }
                                  : a,
                              ),
                            );
                          } catch { /* ignore */ }
                        }}
                        compact
                      />
                    </div>
                  )}
                  {selectedJob.url && (
                    <a
                      href={selectedJob.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                      style={{ color: "var(--primary)" }}
                      title={selectedJob.url}
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span className="truncate max-w-[28rem]">View original posting</span>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => selectedJob && analyzeJob(selectedJob.id)}
                    disabled={!selectedJob || analyzingIds.has(selectedJob?.id ?? "")}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}
                    title="Analyze job"
                  >
                    {analyzingIds.has(selectedJob?.id ?? "") ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    Analyze
                  </button>
                  {canDeleteJob && selectedJob && (
                    <button
                      onClick={() => deleteJob(selectedJob)}
                      disabled={deletingIds.has(selectedJob.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-red-50 disabled:opacity-50"
                      style={{ borderColor: "var(--border)", color: "rgb(220,38,38)" }}
                      title="Delete job and all artifacts"
                    >
                      {deletingIds.has(selectedJob.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  )}
                  <button
                    onClick={backToJobPicker}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Jobs
                  </button>
                </div>
              </div>
            )}

            {/* Pipeline controls */}
            <div
              className="rounded-xl border p-6"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Run Agent Pipeline</h2>
              </div>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                Run all agents automatically in sequence, or pick individual agents below.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => runPipeline("full")}
                  disabled={pipelineRunning || !!runningAgent}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  {pipelineRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Full Pipeline
                </button>
                <button
                  onClick={() => runPipeline("quick")}
                  disabled={pipelineRunning || !!runningAgent}
                  className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Zap className="h-4 w-4" />
                  Quick Pipeline
                </button>
              </div>
              {pipelineRunning && (
                <p className="text-sm mt-3" style={{ color: "var(--muted-foreground)" }}>
                  Pipeline running... this may take a few minutes as each agent analyzes your application.
                </p>
              )}
            </div>

            {/* Skill Gap Check section */}
            {selectedJob && selectedJob.requirements && selectedJob.requirements.length > 0 && (
              <div
                className="rounded-lg border p-4 mb-6"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" style={{ color: "rgb(234,179,8)" }} />
                    <h3 className="font-semibold text-sm">Skill Gap Check</h3>
                    {skillGapResults && !checkingSkillGaps && (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {skillGapResults.filter((r) => r.outlier).length} gap{skillGapResults.filter((r) => r.outlier).length !== 1 ? "s" : ""} of {skillGapResults.length} requirements
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {skillGapResults && skillGapResults.some((r) => r.outlier) && (
                      <button
                        onClick={() => setStoryBuilderOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                      >
                        <BookPlus className="h-3 w-3" />
                        Build Story
                      </button>
                    )}
                    <button
                      onClick={checkSkillGaps}
                      disabled={checkingSkillGaps}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {checkingSkillGaps ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Checking...</>
                      ) : skillGapResults ? (
                        <><Zap className="h-3 w-3" /> Re-check</>
                      ) : (
                        <><Zap className="h-3 w-3" /> Check Skill Gaps</>
                      )}
                    </button>
                  </div>
                </div>
                {!skillGapResults && !checkingSkillGaps && (
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    Compare this job&apos;s {selectedJob.requirements.length} requirements against your profile and Story Bank.
                  </p>
                )}
                {skillGapResults && (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {skillGapResults.map((req, idx) => (
                      <div key={idx}>
                        <div className="flex items-start gap-2 text-sm">
                          {!req.outlier ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                          )}
                          <span
                            className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              req.type === "required"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : req.type === "preferred"
                                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            }`}
                          >
                            {req.type === "nice_to_have" ? "Bonus" : req.type === "preferred" ? "Pref" : "Req"}
                          </span>
                          <span className="flex-1">{req.text}</span>
                          {!req.outlier && req.matched_in && (
                            <span className="shrink-0 text-[10px] text-green-600">
                              {req.matched_in === "story_bank" ? "Story Bank" : "Profile"}
                            </span>
                          )}
                          {req.outlier && (
                            <span className="shrink-0 text-[10px] text-orange-600 dark:text-orange-400">Gap</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Agent cards with preflight + run buttons */}
            <div>
              <h2 className="font-semibold mb-4">Individual Agents</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((agent) => {
                  const pf = preflights.find((p) => p.agent_name === agent.key);
                  const isRunning = runningAgent === agent.key;
                  const artifacts = workspace.artifacts.filter((a) => a.agent_name === agent.key);

                  return (
                    <div
                      key={agent.key}
                      className="rounded-xl border p-5"
                      style={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
                        >
                          <agent.icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm">{agent.name}</h3>
                          {tierBadge(agent.modelTier)}
                        </div>
                      </div>

                      {/* Preflight status */}
                      {pf && (
                        <div className="mb-3 space-y-1">
                          {pf.items.slice(0, 3).map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {statusIcon(item.status)}
                              <span>{item.name}</span>
                            </div>
                          ))}
                          {pf.items.length > 3 && (
                            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                              +{pf.items.length - 3} more items
                            </p>
                          )}
                          {pf.items.length === 0 && (
                            <div className="flex items-center gap-2 text-xs text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>All data ready</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Existing artifacts -- grouped by type, latest shown, older collapsible */}
                      {artifacts.length > 0 && (() => {
                        const groups = groupArtifacts(artifacts);
                        return (
                          <div className="mb-3 space-y-2">
                            {Array.from(groups.entries()).map(([groupKey, arts]) => {
                              const latest = arts[0];
                              const older = arts.slice(1);
                              const isExpanded = expandedHistoryKeys.has(groupKey);
                              return (
                                <div key={groupKey}>
                                  <button
                                    onClick={() => setSelectedArtifact(latest)}
                                    className="flex items-center gap-2 text-xs w-full text-left hover:underline"
                                    style={{ color: "var(--primary)" }}
                                  >
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{latest.title}</span>
                                    <span className="shrink-0 text-[10px] opacity-60">v{latest.version}</span>
                                  </button>
                                  {older.length > 0 && (
                                    <>
                                      <button
                                        onClick={() => toggleHistory(groupKey)}
                                        className="flex items-center gap-1 text-[10px] ml-5 mt-0.5"
                                        style={{ color: "var(--muted-foreground)" }}
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="h-2.5 w-2.5" />
                                        ) : (
                                          <ChevronRight className="h-2.5 w-2.5" />
                                        )}
                                        <History className="h-2.5 w-2.5" />
                                        {older.length} previous version{older.length > 1 ? "s" : ""}
                                      </button>
                                      {isExpanded && (
                                        <div className="ml-5 mt-1 space-y-0.5 border-l pl-2" style={{ borderColor: "var(--border)" }}>
                                          {older.map((art) => (
                                            <button
                                              key={art.id}
                                              onClick={() => setSelectedArtifact(art)}
                                              className="flex items-center gap-2 text-[11px] w-full text-left hover:underline"
                                              style={{ color: "var(--muted-foreground)" }}
                                            >
                                              <FileText className="h-2.5 w-2.5 shrink-0" />
                                              <span className="truncate">v{art.version}</span>
                                              <span className="shrink-0 text-[10px] opacity-50">{formatRelative(art.created_at)}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Identity Shield toggle (Tailor only -- ON by default) */}
                      {agent.key === "tailor" && (
                        <label
                          className="flex items-center gap-2 mb-2 cursor-pointer rounded-md px-3 py-2 transition-colors"
                          style={{
                            backgroundColor: identityShield ? "rgba(16,185,129,0.08)" : "transparent",
                            border: identityShield ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent",
                          }}
                        >
                          <div
                            className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors"
                            style={{
                              backgroundColor: identityShield ? "rgb(16,185,129)" : "var(--border)",
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              setIdentityShield(!identityShield);
                            }}
                          >
                            <span
                              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                              style={{
                                transform: identityShield ? "translate(17px, 2px)" : "translate(2px, 2px)",
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">Identity Shield</span>
                            <p className="text-[10px] leading-tight" style={{ color: "var(--muted-foreground)" }}>
                              Protect titles, summary, and seniority level from AI demotion
                            </p>
                          </div>
                          <Fingerprint
                            className="h-4 w-4 shrink-0"
                            style={{ color: identityShield ? "rgb(16,185,129)" : "var(--muted-foreground)", opacity: identityShield ? 1 : 0.4 }}
                          />
                        </label>
                      )}

                      {/* Ageism Shield toggle (Tailor only) */}
                      {agent.key === "tailor" && (
                        <label
                          className="flex items-center gap-2 mb-2 cursor-pointer rounded-md px-3 py-2 transition-colors"
                          style={{
                            backgroundColor: ageismShield ? "rgba(139,92,246,0.08)" : "transparent",
                            border: ageismShield ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
                          }}
                        >
                          <div
                            className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors"
                            style={{
                              backgroundColor: ageismShield ? "rgb(139,92,246)" : "var(--border)",
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              setAgeismShield(!ageismShield);
                            }}
                          >
                            <span
                              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                              style={{
                                transform: ageismShield ? "translate(17px, 2px)" : "translate(2px, 2px)",
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">Ageism Shield</span>
                            <p className="text-[10px] leading-tight" style={{ color: "var(--muted-foreground)" }}>
                              Remove age signals, consolidate early career, scrub dates
                            </p>
                          </div>
                          <ShieldCheck
                            className="h-4 w-4 shrink-0"
                            style={{ color: ageismShield ? "rgb(139,92,246)" : "var(--muted-foreground)", opacity: ageismShield ? 1 : 0.4 }}
                          />
                        </label>
                      )}

                      {/* Overqualification Shield toggle (Tailor only) */}
                      {agent.key === "tailor" && (
                        <label
                          className="flex items-center gap-2 mb-2 cursor-pointer rounded-md px-3 py-2 transition-colors"
                          style={{
                            backgroundColor: overqualificationShield ? "rgba(217,119,6,0.08)" : "transparent",
                            border: overqualificationShield ? "1px solid rgba(217,119,6,0.3)" : "1px solid transparent",
                          }}
                        >
                          <div
                            className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors"
                            style={{
                              backgroundColor: overqualificationShield ? "rgb(217,119,6)" : "var(--border)",
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              setOverqualificationShield(!overqualificationShield);
                            }}
                          >
                            <span
                              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                              style={{
                                transform: overqualificationShield ? "translate(17px, 2px)" : "translate(2px, 2px)",
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium">Overqualification Shield</span>
                            <p className="text-[10px] leading-tight" style={{ color: "var(--muted-foreground)" }}>
                              Right-size titles, de-emphasize scope, add &quot;Why This Role&quot; positioning
                            </p>
                          </div>
                          <ShieldAlert
                            className="h-4 w-4 shrink-0"
                            style={{ color: overqualificationShield ? "rgb(217,119,6)" : "var(--muted-foreground)", opacity: overqualificationShield ? 1 : 0.4 }}
                          />
                        </label>
                      )}

                      {/* Interview Prep Coach: stage picker + notes */}
                      {agent.key === "interview_prep_coach" && (
                        <div className="mb-2 space-y-2">
                          <div>
                            <label className="text-xs font-medium mb-1 block">
                              Interview stage
                            </label>
                            <select
                              value={interviewStage}
                              onChange={(e) => setInterviewStage(e.target.value)}
                              className="w-full rounded-md border px-2 py-1.5 text-xs"
                              style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                            >
                              {INTERVIEW_STAGES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium mb-1 block">
                              Notes (optional)
                            </label>
                            <textarea
                              value={interviewNotes}
                              onChange={(e) => setInterviewNotes(e.target.value)}
                              rows={2}
                              placeholder="E.g., Monday call, expect comp/notice questions"
                              className="w-full rounded-md border px-2 py-1.5 text-xs resize-none"
                              style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {agent.key === "auto_fill" ? (
                          <button
                            onClick={openAutoFillModal}
                            disabled={pipelineRunning}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                            style={{
                              backgroundColor: agent.color,
                              color: "white",
                            }}
                          >
                            <MousePointerClick className="h-3 w-3" />
                            Open Application Form
                          </button>
                        ) : (
                          <button
                            onClick={() => runAgent(agent.key)}
                            disabled={isRunning || pipelineRunning}
                            className="flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 hover:bg-accent"
                            style={{ borderColor: "var(--border)" }}
                          >
                            {isRunning ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Running...
                              </span>
                            ) : artifacts.length > 0 ? (
                              "Re-run Agent"
                            ) : (
                              "Run Agent"
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => chatWithAgent(agent)}
                          disabled={pipelineRunning}
                          className="inline-flex items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 hover:bg-accent"
                          style={{ borderColor: "var(--border)" }}
                          title={
                            agent.key === "tailor" ||
                            agent.key === "achievement_amplifier"
                              ? `Review and revise the latest ${agent.name} resume`
                              : `Chat with ${agent.name} about this application`
                          }
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ─── Interview Journal ─── */}
            {currentApp && (
              <InterviewJournal
                applicationId={currentApp.id}
                currentStage={currentApp.pipeline_stage || "tbat"}
              />
            )}

            {/* ─── Interview Likelihood Indicator ─── */}
            <div
              className="rounded-xl border p-6"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "rgba(217,119,6,0.1)", color: "rgb(217,119,6)" }}
                  >
                    <Gavel className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">Interview Likelihood Indicator</h2>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Synthesized verdict from all agents
                    </p>
                  </div>
                </div>
                <button
                  onClick={runVerdict}
                  disabled={verdictRunning || pipelineRunning || !!runningAgent}
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "rgb(217,119,6)", color: "white" }}
                >
                  {verdictRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {getVerdictData() ? "Re-analyze" : "Get Verdict"}
                </button>
              </div>

              {verdictRunning && (
                <div className="flex items-center justify-center py-8 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: "rgb(217,119,6)" }} />
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    Analyzing all agent outputs and rendering final verdict...
                  </span>
                </div>
              )}

              {!verdictRunning && (() => {
                const vd = getVerdictData();
                const narrative = getNarrativeArtifact();
                if (!vd) {
                  return (
                    <p className="text-sm text-center py-6" style={{ color: "var(--muted-foreground)" }}>
                      Run agents first, then click &quot;Get Verdict&quot; for a synthesized interview likelihood analysis.
                    </p>
                  );
                }

                const decisionColor = vd.captain.decision === "INTERVIEW"
                  ? "rgb(5,150,105)" : vd.captain.decision === "PASS"
                  ? "rgb(239,68,68)" : "rgb(217,119,6)";
                const decisionBg = vd.captain.decision === "INTERVIEW"
                  ? "rgba(5,150,105,0.1)" : vd.captain.decision === "PASS"
                  ? "rgba(239,68,68,0.1)" : "rgba(217,119,6,0.1)";

                const interviewCount = vd.verdicts.filter((v) => isInterviewVote(v.vote)).length;
                const passCount = vd.verdicts.length - interviewCount;
                const interviewPct = vd.verdicts.length > 0 ? (interviewCount / vd.verdicts.length) * 100 : 0;

                return (
                  <>
                    {/* Captain's Verdict */}
                    <div
                      className="rounded-lg p-5 mb-5"
                      style={{
                        backgroundColor: decisionBg,
                        border: `2px solid ${decisionColor}`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold"
                          style={{ backgroundColor: decisionColor, color: "white" }}
                        >
                          <Gavel className="h-3.5 w-3.5" />
                          {vd.captain.decision}
                        </span>
                        <span className="text-sm font-medium" style={{ color: decisionColor }}>
                          Confidence: {vd.captain.confidence}%
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg mb-3">{vd.captain.headline}</h3>

                      {vd.captain.what_others_missed && (
                        <div className="mb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>
                            What the Advisory Team Missed
                          </h4>
                          <p className="text-sm">{vd.captain.what_others_missed}</p>
                        </div>
                      )}

                      {vd.captain.intangibles && vd.captain.intangibles.length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>
                            Intangible Factors
                          </h4>
                          <ul className="space-y-1">
                            {vd.captain.intangibles.map((item, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: decisionColor }} />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {vd.captain.strategic_advice && (
                        <div
                          className="rounded-md p-3"
                          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
                        >
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>
                            Strategic Advice
                          </h4>
                          <p className="text-sm">{vd.captain.strategic_advice}</p>
                        </div>
                      )}
                    </div>

                    {/* Vote summary bar */}
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-sm font-medium" style={{ color: "rgb(5,150,105)" }}>
                        {interviewCount} Interview
                      </span>
                      <span className="text-sm font-medium" style={{ color: "rgb(239,68,68)" }}>
                        {passCount} Pass
                      </span>
                      <div
                        className="flex-1 h-2.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "var(--border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${interviewPct}%`,
                            backgroundColor: "rgb(16,185,129)",
                          }}
                        />
                      </div>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {vd.verdicts.length} agents voted
                      </span>
                    </div>

                    {/* Agent vote cards */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {vd.verdicts.map((v) => {
                        const agentDef = agentByKey[v.agent];
                        const AgentIcon = agentDef?.icon;
                        const isExpanded = verdictExpanded.has(v.agent);
                        return (
                          <div
                            key={v.agent}
                            className="rounded-lg border p-4"
                            style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {AgentIcon && (
                                <div
                                  className="flex h-7 w-7 items-center justify-center rounded-md"
                                  style={{
                                    backgroundColor: agentDef ? `${agentDef.color}20` : "var(--border)",
                                    color: agentDef?.color || "var(--muted-foreground)",
                                  }}
                                >
                                  <AgentIcon className="h-3.5 w-3.5" />
                                </div>
                              )}
                              <span className="text-sm font-medium flex-1">{v.agent_label}</span>
                              <span
                                className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{ backgroundColor: voteBg(v.vote), color: voteColor(v.vote) }}
                              >
                                {voteLabel(v.vote)}
                              </span>
                            </div>
                            {/* Confidence bar */}
                            <div
                              className="h-1.5 rounded-full mb-2"
                              style={{ backgroundColor: "var(--border)" }}
                            >
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${v.confidence}%`,
                                  backgroundColor: voteColor(v.vote),
                                }}
                              />
                            </div>
                            <p className="text-xs font-medium mb-1">{v.key_factor}</p>
                            <button
                              onClick={() => toggleVerdictExpand(v.agent)}
                              className="text-[10px] underline"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {isExpanded ? "Hide" : "Show"} reasoning
                            </button>
                            {isExpanded && (
                              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                                {v.reasoning}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Link to full narrative */}
                    {narrative && (
                      <button
                        onClick={() => setSelectedArtifact(narrative)}
                        className="mt-4 text-sm font-medium underline"
                        style={{ color: "var(--primary)" }}
                      >
                        View Captain&apos;s Full Analysis
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Task result */}
            {taskResult && (
              <div
                className="rounded-xl border p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h3 className="font-semibold mb-2">Agent Result</h3>
                <pre className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted-foreground)" }}>
                  {taskResult.summary}
                </pre>
                {taskResult.preflight_warnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <p className="text-xs font-medium mb-1">Data suggestions for better results:</p>
                    {taskResult.preflight_warnings.map((w, i) => (
                      <p key={i} className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        &bull; {w.detail || w.description}
                      </p>
                    ))}
                  </div>
                )}
                {taskResult.next_suggested_agent && (
                  <div className="mt-3">
                    <button
                      onClick={() => runAgent(taskResult.next_suggested_agent!)}
                      disabled={!!runningAgent}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: "var(--primary)",
                        color: "var(--primary-foreground)",
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                      Run {agentByKey[taskResult.next_suggested_agent]?.name || taskResult.next_suggested_agent} next
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Artifact viewer */}
            {selectedArtifact && (
              <div
                ref={artifactViewerRef}
                className="rounded-xl border p-6"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{selectedArtifact.title}</h3>
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: "rgba(59,130,246,0.1)",
                          color: "rgb(59,130,246)",
                        }}
                      >
                        v{selectedArtifact.version}
                      </span>
                      {workspace && (() => {
                        const groupKey = `${selectedArtifact.agent_name}::${selectedArtifact.artifact_type}`;
                        const groups = groupArtifacts(workspace.artifacts);
                        const group = groups.get(groupKey);
                        const isLatest = group && group[0].id === selectedArtifact.id;
                        if (!isLatest) {
                          return (
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: "rgba(234,179,8,0.15)", color: "rgb(161,98,7)" }}
                            >
                              older version
                            </span>
                          );
                        }
                        return (
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "rgb(5,150,105)" }}
                          >
                            latest
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      By {agentByKey[selectedArtifact.agent_name]?.name || selectedArtifact.agent_name} &middot;
                      {formatRelative(selectedArtifact.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {["skill_gap_report", "job_match_analysis"].includes(selectedArtifact.artifact_type) && (
                      <button
                        onClick={() => {
                          const gaps = parseGapsFromArtifact(selectedArtifact.content);
                          setStoryBuilderGaps(gaps);
                          setStoryBuilderOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                        title="Build a story to address skill gaps"
                      >
                        <BookPlus className="h-3 w-3" />
                        Build Story
                      </button>
                    )}
                    {workspace && (
                      <>
                        <button
                          onClick={() => handleDownload("docx")}
                          disabled={downloading === "docx"}
                          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                          style={{ borderColor: "var(--border)" }}
                          title="Download as Word document"
                        >
                          {downloading === "docx" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          DOCX
                        </button>
                        <button
                          onClick={() => handleDownload("pdf")}
                          disabled={downloading === "pdf"}
                          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                          style={{ borderColor: "var(--border)" }}
                          title="Download as PDF"
                        >
                          {downloading === "pdf" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          PDF
                        </button>
                      </>
                    )}
                    {selectedArtifact.content_format === "javascript" && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedArtifact.content);
                          setCopiedScript(true);
                          setTimeout(() => setCopiedScript(false), 2000);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                        style={{
                          borderColor: copiedScript ? "rgb(16,185,129)" : "var(--border)",
                          color: copiedScript ? "rgb(16,185,129)" : undefined,
                        }}
                        title="Copy auto-fill script to clipboard"
                      >
                        {copiedScript ? (
                          <><ClipboardCheck className="h-3 w-3" /> Copied!</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy Script</>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedArtifact(null)}
                      className="text-sm underline"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Close
                    </button>
                  </div>
                </div>
                {downloadError && (
                  <p className="text-xs text-red-500 mt-1">{downloadError}</p>
                )}
                <div
                  className="prose prose-sm max-w-none rounded-lg border p-4 overflow-auto max-h-[60vh]"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--background)",
                  }}
                >
                  {selectedArtifact.content_format === "javascript" ? (
                    <pre className="text-xs leading-relaxed" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      <code>{selectedArtifact.content}</code>
                    </pre>
                  ) : selectedArtifact.artifact_type === "interview_flashcards" ? (
                    (() => {
                      let cards: { q: string; a: string; tag?: string }[] = [];
                      try {
                        const parsed = JSON.parse(selectedArtifact.content);
                        if (Array.isArray(parsed)) cards = parsed;
                      } catch {
                        // fall through to empty list
                      }
                      if (cards.length === 0) {
                        return (
                          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                            No flashcards found.
                          </p>
                        );
                      }
                      return (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {cards.map((card, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border p-3"
                              style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>
                                  Card {idx + 1}
                                </span>
                                {card.tag && (
                                  <span
                                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                    style={{ backgroundColor: "rgba(244,63,94,0.1)", color: "rgb(244,63,94)" }}
                                  >
                                    {card.tag}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold mb-1.5">{card.q}</p>
                              <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                                {card.a}
                              </p>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  ) : selectedArtifact.artifact_type === "skill_gap_check" ? (
                    (() => {
                      let reqs: EnrichedRequirement[] = [];
                      try {
                        const parsed = JSON.parse(selectedArtifact.content);
                        if (Array.isArray(parsed)) reqs = parsed;
                      } catch { /* ignore */ }
                      if (reqs.length === 0) {
                        return (
                          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                            No requirements found.
                          </p>
                        );
                      }
                      const gaps = reqs.filter((r) => r.outlier).length;
                      return (
                        <div className="space-y-2">
                          <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                            {gaps} gap{gaps !== 1 ? "s" : ""} of {reqs.length} requirements
                          </p>
                          <div className="space-y-1">
                            {reqs.map((req, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs">
                                {!req.outlier ? (
                                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                                ) : (
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                                )}
                                <span
                                  className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${
                                    req.type === "required"
                                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                      : req.type === "preferred"
                                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  }`}
                                >
                                  {req.type === "nice_to_have" ? "Bonus" : req.type === "preferred" ? "Pref" : "Req"}
                                </span>
                                <span className="flex-1">{req.text}</span>
                                {!req.outlier && req.matched_in && (
                                  <span className="shrink-0 text-[10px] text-green-600">
                                    {req.matched_in === "story_bank" ? "Story Bank" : "Profile"}
                                  </span>
                                )}
                                {req.outlier && (
                                  <span className="shrink-0 text-[10px] text-orange-500">Gap</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  ) : selectedArtifact.content_format === "json" ? (
                    <pre className="text-xs leading-relaxed" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      <code>{(() => { try { return JSON.stringify(JSON.parse(selectedArtifact.content), null, 2); } catch { return selectedArtifact.content; } })()}</code>
                    </pre>
                  ) : (
                    <MarkdownContent content={selectedArtifact.content} />
                  )}
                </div>
              </div>
            )}
          </>
          );
        })()}

        {/* ─── Auto-Fill Modal ─── */}
        {showAutoFillModal && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[3vh] bg-black/50"
            onClick={() => setShowAutoFillModal(false)}
          >
            <div
              className="w-full max-w-4xl max-h-[94vh] flex flex-col rounded-xl border shadow-xl"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "rgba(14,165,233,0.1)", color: "rgb(14,165,233)" }}
                  >
                    <MousePointerClick className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg">
                      {detectedMethod === "chatbot" ? "Chatbot Application Assistant" : "Job Application Form"}
                    </h2>
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {autoFillJobTitle} at {autoFillJobCompany}
                      {detectedMethod === "chatbot" && (
                        <span className="ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "rgba(139,92,246,0.1)", color: "rgb(124,58,237)" }}>
                          Chatbot
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowAutoFillModal(false)} className="rounded-md p-1.5 transition-colors hover:bg-accent">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* Loading state */}
                {autoFillLoading && (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin mb-4" style={{ color: "rgb(14,165,233)" }} />
                    <p className="text-sm font-medium">
                      {detectedMethod === "unknown"
                        ? "Detecting application method..."
                        : detectedMethod === "chatbot"
                          ? "Simulating chatbot to collect questions..."
                          : "Analyzing your profile and tailoring your application..."}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                      This may take a moment as AI prepares your responses.
                    </p>
                  </div>
                )}

                {/* Success state */}
                {submitSuccess && (
                  <div className="flex flex-col items-center justify-center py-20">
                    <CheckCircle2 className="h-16 w-16 mb-4 text-green-500" />
                    <h3 className="text-xl font-semibold mb-2">Application Submitted!</h3>
                    <p className="text-sm text-center max-w-md" style={{ color: "var(--muted-foreground)" }}>
                      Your application for <strong>{autoFillJobTitle}</strong> at <strong>{autoFillJobCompany}</strong> has been submitted.
                    </p>
                    {chatbotSubmitResult && chatbotSubmitResult.verification.length > 0 && (
                      <div className="mt-4 w-full max-w-lg">
                        <h4 className="text-sm font-semibold mb-2">Verification</h4>
                        <div className="space-y-1">
                          {chatbotSubmitResult.verification.map((v, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {v.match === "exact" || v.match === "partial" ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                              ) : v.match === "unexpected" ? (
                                <AlertCircle className="h-3 w-3 text-yellow-500 shrink-0" />
                              ) : (
                                <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                              )}
                              <span style={{ color: "var(--muted-foreground)" }}>
                                {v.match === "unexpected"
                                  ? `New question from chatbot: "${(v.live || "").slice(0, 60)}..."`
                                  : v.match === "missing"
                                    ? `Expected question not asked: "${(v.simulated || "").slice(0, 60)}..."`
                                    : `Matched: "${(v.simulated || "").slice(0, 50)}..."`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setShowAutoFillModal(false)}
                      className="mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                      style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      Close
                    </button>
                  </div>
                )}

                {/* ═══ CHATBOT MODE ═══ */}
                {!autoFillLoading && !submitSuccess && detectedMethod === "chatbot" && chatbotQuestions.length > 0 && (
                  <div className="space-y-4">
                    {/* Progress bar */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(chatbotQuestions.filter((q) => q.status !== "pending").length / chatbotQuestions.length) * 100}%`,
                            backgroundColor: "rgb(14,165,233)",
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                        {chatbotQuestions.filter((q) => q.status !== "pending").length} / {chatbotQuestions.length}
                      </span>
                    </div>

                    {/* Question list (left) + Active question (right) */}
                    <div className="flex gap-4">
                      {/* Question sidebar */}
                      <div className="w-56 shrink-0 space-y-1">
                        {chatbotQuestions.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => goToQuestion(i)}
                            className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                              i === activeQuestionIdx ? "bg-accent font-medium" : "hover:bg-accent/50"
                            }`}
                          >
                            {q.status === "accepted" ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                            ) : q.status === "edited" ? (
                              <CheckCircle2 className="h-3 w-3 text-blue-500 shrink-0" />
                            ) : q.status === "skipped" ? (
                              <Circle className="h-3 w-3 text-yellow-500 shrink-0" />
                            ) : (
                              <Circle className="h-3 w-3 shrink-0" style={{ color: "var(--muted-foreground)" }} />
                            )}
                            <span className="truncate">Q{i + 1}: {q.question.slice(0, 30)}...</span>
                          </button>
                        ))}
                      </div>

                      {/* Active question panel */}
                      <div className="flex-1">
                        {(() => {
                          const q = chatbotQuestions[activeQuestionIdx];
                          if (!q) return null;
                          return (
                            <div className="space-y-4">
                              {/* Bot question bubble */}
                              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--accent)" }}>
                                <p className="text-xs font-medium mb-1" style={{ color: "var(--muted-foreground)" }}>
                                  Chatbot asks:
                                </p>
                                <p className="text-sm font-medium">{q.question}</p>
                              </div>

                              {/* AI suggested answer */}
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <Sparkles className="h-3.5 w-3.5" style={{ color: "rgb(14,165,233)" }} />
                                  <span className="text-xs font-medium">AI Suggested Answer</span>
                                  <span
                                    className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                    style={{
                                      backgroundColor: q.confidence === "high" ? "rgba(16,185,129,0.1)" : q.confidence === "medium" ? "rgba(59,130,246,0.1)" : "rgba(234,179,8,0.1)",
                                      color: q.confidence === "high" ? "rgb(5,150,105)" : q.confidence === "medium" ? "rgb(59,130,246)" : "rgb(161,98,7)",
                                    }}
                                  >
                                    {q.confidence} confidence
                                  </span>
                                </div>
                                <textarea
                                  value={editingAnswer}
                                  onChange={(e) => setEditingAnswer(e.target.value)}
                                  rows={3}
                                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                                  style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
                                />
                              </div>

                              {/* Accept / Edit / Skip buttons */}
                              <div className="flex gap-2">
                                <button
                                  onClick={acceptAnswer}
                                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                                  style={{ backgroundColor: "rgb(16,185,129)", color: "white" }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Accept
                                </button>
                                <button
                                  onClick={editAnswer}
                                  disabled={editingAnswer === q.suggested_answer}
                                  className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 hover:bg-accent"
                                  style={{ borderColor: "var(--border)" }}
                                >
                                  Save Edit
                                </button>
                                <button
                                  onClick={skipAnswer}
                                  className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                                  style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                                >
                                  Skip
                                </button>
                              </div>

                              {/* Status for current question */}
                              {q.status !== "pending" && (
                                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                                  {q.status === "accepted" && <><CheckCircle2 className="h-3 w-3 text-green-500" /> Accepted</>}
                                  {q.status === "edited" && <><CheckCircle2 className="h-3 w-3 text-blue-500" /> Edited and saved</>}
                                  {q.status === "skipped" && <><Circle className="h-3 w-3 text-yellow-500" /> Skipped — will not be sent</>}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Review summary when all done */}
                    {allQuestionsReviewed && (
                      <div className="rounded-lg border p-4 mt-4" style={{ borderColor: "rgb(14,165,233)", backgroundColor: "rgba(14,165,233,0.05)" }}>
                        <h4 className="font-semibold text-sm mb-2">Ready to Submit</h4>
                        <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                          {chatbotQuestions.filter((q) => q.status === "accepted").length} accepted,{" "}
                          {chatbotQuestions.filter((q) => q.status === "edited").length} edited,{" "}
                          {chatbotQuestions.filter((q) => q.status === "skipped").length} skipped.
                          The chatbot will be driven with your approved answers and verified against the simulation.
                        </p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {chatbotQuestions.filter((q) => q.status !== "skipped").map((q, i) => (
                            <div key={i} className="flex gap-2 text-xs">
                              <span className="font-medium shrink-0 w-16">Q{q.index + 1}:</span>
                              <span className="truncate" style={{ color: "var(--muted-foreground)" }}>
                                {q.approved_answer || "(empty)"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ FORM MODE ═══ */}
                {!autoFillLoading && !submitSuccess && detectedMethod !== "chatbot" && autoFillFields.length > 0 && (
                  <div className="space-y-6">
                    {(["personal", "professional", "additional"] as const).map((section) => {
                      const sectionFields = autoFillFields.filter((f) => f.section === section);
                      if (sectionFields.length === 0) return null;
                      const sectionLabel = { personal: "Personal Information", professional: "Professional Details", additional: "Additional Questions" }[section];
                      return (
                        <div key={section}>
                          <h3 className="font-semibold text-sm mb-3 pb-2 border-b" style={{ borderColor: "var(--border)" }}>{sectionLabel}</h3>
                          <div className="space-y-4">
                            {sectionFields.map((field) => {
                              const cIssue = completenessResult?.issues.find((i) => i.field_key === field.key);
                              const bfImprove = bestFitResult?.improvements.find((i) => i.field_key === field.key);
                              return (
                                <div key={field.key}>
                                  <label className="block text-sm font-medium mb-1">
                                    {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                                  </label>
                                  {field.field_type === "textarea" ? (
                                    <textarea value={field.value} onChange={(e) => updateFormField(field.key, e.target.value)} rows={field.key === "cover_letter" ? 8 : 4}
                                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                                      style={{ backgroundColor: "var(--background)", borderColor: cIssue ? "rgb(239,68,68)" : bfImprove ? "rgb(234,179,8)" : "var(--border)" }} />
                                  ) : field.field_type === "select" ? (
                                    <select value={field.value} onChange={(e) => updateFormField(field.key, e.target.value)}
                                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                                      style={{ backgroundColor: "var(--background)", borderColor: cIssue ? "rgb(239,68,68)" : "var(--border)" }}>
                                      <option value="">Select...</option>
                                      {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                  ) : (
                                    <input type={field.field_type} value={field.value} onChange={(e) => updateFormField(field.key, e.target.value)}
                                      className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                                      style={{ backgroundColor: "var(--background)", borderColor: cIssue ? "rgb(239,68,68)" : bfImprove ? "rgb(234,179,8)" : "var(--border)" }} />
                                  )}
                                  {cIssue && <div className="flex items-center gap-1.5 mt-1"><AlertCircle className="h-3 w-3 text-red-500 shrink-0" /><p className="text-xs text-red-500">{cIssue.issue}</p></div>}
                                  {bfImprove && (
                                    <div className="mt-1.5 rounded-md border px-3 py-2" style={{ backgroundColor: "rgba(234,179,8,0.05)", borderColor: "rgba(234,179,8,0.3)" }}>
                                      <div className="flex items-start gap-1.5">
                                        <Sparkles className="h-3 w-3 mt-0.5 shrink-0" style={{ color: "rgb(234,179,8)" }} />
                                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}><strong style={{ color: "rgb(161,98,7)" }}>Suggestion:</strong> {bfImprove.suggestion}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {completenessResult && (
                      <div className="rounded-lg border p-4" style={{ borderColor: completenessResult.complete ? "rgb(16,185,129)" : "rgb(239,68,68)", backgroundColor: completenessResult.complete ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)" }}>
                        <div className="flex items-center gap-2 mb-1">
                          {completenessResult.complete ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <TriangleAlert className="h-4 w-4 text-red-500" />}
                          <h4 className="font-semibold text-sm">{completenessResult.complete ? "All fields complete!" : `${completenessResult.issues.length} issue(s) found`}</h4>
                        </div>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{completenessResult.filled_fields} of {completenessResult.total_fields} fields filled.</p>
                      </div>
                    )}
                    {bestFitResult && (
                      <div className="rounded-lg border p-4" style={{ borderColor: bestFitResult.verdict === "strong" ? "rgb(16,185,129)" : bestFitResult.verdict === "good" ? "rgb(59,130,246)" : "rgb(234,179,8)", backgroundColor: bestFitResult.verdict === "strong" ? "rgba(16,185,129,0.05)" : bestFitResult.verdict === "good" ? "rgba(59,130,246,0.05)" : "rgba(234,179,8,0.05)" }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" style={{ color: bestFitResult.verdict === "strong" ? "rgb(16,185,129)" : bestFitResult.verdict === "good" ? "rgb(59,130,246)" : "rgb(234,179,8)" }} />
                            <h4 className="font-semibold text-sm">Best-Fit Score: {bestFitResult.score}/100</h4>
                          </div>
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bestFitResult.verdict === "strong" ? "rgba(16,185,129,0.1)" : bestFitResult.verdict === "good" ? "rgba(59,130,246,0.1)" : "rgba(234,179,8,0.1)", color: bestFitResult.verdict === "strong" ? "rgb(5,150,105)" : bestFitResult.verdict === "good" ? "rgb(59,130,246)" : "rgb(161,98,7)" }}>
                            {bestFitResult.verdict === "strong" ? "Strong Match" : bestFitResult.verdict === "good" ? "Good Match" : "Needs Work"}
                          </span>
                        </div>
                        <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>{bestFitResult.summary}</p>
                        {bestFitResult.strengths.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-medium mb-1" style={{ color: "rgb(5,150,105)" }}>Strengths:</p>
                            <ul className="text-xs space-y-0.5" style={{ color: "var(--muted-foreground)" }}>
                              {bestFitResult.strengths.map((s, i) => <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {bestFitResult.improvements.length > 0 && (
                          <p className="text-xs" style={{ color: "rgb(161,98,7)" }}>See yellow-highlighted fields above for {bestFitResult.improvements.length} improvement(s).</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal footer */}
              {!autoFillLoading && !submitSuccess && (
                <div className="border-t px-6 py-4 flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
                  {detectedMethod === "chatbot" ? (
                    /* Chatbot footer */
                    <>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Review each question, then submit to the chatbot.
                      </p>
                      <button
                        onClick={submitChatbot}
                        disabled={!allQuestionsReviewed || submitting}
                        className="inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ backgroundColor: allQuestionsReviewed ? "rgb(16,185,129)" : "var(--muted)", color: "white" }}
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                        Submit to Chatbot
                      </button>
                    </>
                  ) : autoFillFields.length > 0 ? (
                    /* Form footer */
                    <>
                      <div className="flex gap-2">
                        <button onClick={runCompletenessCheck} disabled={completenessLoading || bestFitLoading}
                          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 hover:bg-accent"
                          style={{ borderColor: "var(--border)" }}>
                          {completenessLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheckIcon className="h-4 w-4" />}
                          Check Completeness
                        </button>
                        <button onClick={runBestFitReview} disabled={bestFitLoading || completenessLoading}
                          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 hover:bg-accent"
                          style={{ borderColor: "var(--border)" }}>
                          {bestFitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          Best-Fit Review
                        </button>
                      </div>
                      <button onClick={submitFormApplication} disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ backgroundColor: "rgb(16,185,129)", color: "white" }}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                        Submit Application
                      </button>
                    </>
                  ) : <div />}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {resumeChatOverlays}
      {storyBuilderOverlay}
      </>
    );
  }

  // ─── Chat view ─────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Chat header */}
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => { setActiveAgent(null); setViewMode("workspace"); }}
          className="rounded p-1 transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        {activeAgent && (
          <>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                backgroundColor: `${activeAgent.color}20`,
                color: activeAgent.color,
              }}
            >
              <activeAgent.icon className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-sm">{activeAgent.name} Agent</h2>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {activeAgent.description.slice(0, 60)}...
              </p>
            </div>
          </>
        )}
        <button
          onClick={() => setShowConvoSidebar(!showConvoSidebar)}
          className="rounded p-1 transition-colors hover:bg-accent lg:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation sidebar */}
        {showConvoSidebar && (
          <div
            className="w-60 shrink-0 border-r overflow-y-auto"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="p-3">
              <button
                onClick={startNewConversation}
                className="w-full rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                New Conversation
              </button>
            </div>
            {loadingConvos ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--primary)" }} />
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center" style={{ color: "var(--muted-foreground)" }}>
                No conversations yet.
              </p>
            ) : (
              <ul className="space-y-0.5 px-2 pb-2">
                {conversations.map((convo) => (
                  <li key={convo.id}>
                    <button
                      onClick={() => openConversation(convo)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        activeConversation?.id === convo.id
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {convo.context_id ? "Job Chat" : convo.context_type}
                        </span>
                      </div>
                      <span className="text-xs block mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        {formatRelative(convo.updated_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Chat area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {!activeConversation ? (
            <div className="flex flex-1 items-center justify-center">
              {activeAgent && (
                <div className="text-center">
                  <activeAgent.icon
                    className="mx-auto h-12 w-12 mb-4"
                    style={{ color: activeAgent.color }}
                  />
                  <h3 className="font-semibold mb-2">Start a conversation with {activeAgent.name}</h3>
                  <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                    Select an existing conversation or start a new one.
                  </p>
                  <button
                    onClick={startNewConversation}
                    className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    New Conversation
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      No messages yet. Send a message to get started.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className="max-w-[75%] rounded-xl px-4 py-2.5"
                        style={{
                          backgroundColor:
                            msg.role === "user" ? "var(--primary)" : "var(--accent)",
                          color:
                            msg.role === "user" ? "var(--primary-foreground)" : "var(--accent-foreground)",
                        }}
                      >
                        {msg.role === "assistant" ? (
                          <MarkdownContent content={msg.content} className="text-sm" />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        )}
                        <p className="text-xs mt-1 opacity-60">{formatRelative(msg.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={activeAgent ? `Message ${activeAgent.name}...` : "Type a message..."}
                    disabled={sending}
                    className="flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--background)",
                      borderColor: "var(--border)",
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || sending}
                    className="inline-flex items-center justify-center rounded-md h-9 w-9 transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {resumeChatOverlays}
      {storyBuilderOverlay}
    </div>
  );
}
