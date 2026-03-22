"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiPost, apiPut, apiDownload } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRelative } from "@/lib/utils";
import { MarkdownContent } from "@/components/markdown-content";
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
  JobListing,
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
  ShieldCheck,
  SendHorizonal,
  TriangleAlert,
} from "lucide-react";

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
    name: "Coach",
    key: "coach",
    icon: GraduationCap,
    description: "Prepares you for interviews with practice questions and feedback on your answers.",
    modelTier: "standard",
    color: "rgb(16,185,129)",
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
        loadWorkspace(job);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadJobId, jobListings, workspace]);

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
        `/agents/${activeAgent.name.toLowerCase()}/conversations`,
        { context_type: "general" },
      );
      setActiveConversation(convo);
      setMessages([]);
      await fetchConversations(activeAgent.name);
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
      const result = await apiPost<AgentTaskResult>(
        `/agents/workspaces/${workspace.id}/run-agent`,
        { agent_name: agentName },
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

  if (viewMode === "workspace") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Application Studio</h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Select a job listing and let AI agents craft your application — tailored resume, cover letter, interview prep, and more.
          </p>
        </div>

        {/* Job listing selector */}
        {!workspace && (
          <div
            className="rounded-xl border p-6"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          >
            <h2 className="font-semibold mb-4">Select a Job Listing</h2>
            {jobListings.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                No job listings yet. Add a job listing first from the Job Listings page.
              </p>
            ) : (
              <div className="space-y-2">
                {jobListings.map((job) => {
                  const existingApp = applications.find((a) => a.job_listing_id === job.id);
                  return (
                    <button
                      key={job.id}
                      onClick={() => loadWorkspace(job)}
                      disabled={loadingWorkspace}
                      className="w-full flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <Briefcase className="h-5 w-5 shrink-0" style={{ color: "var(--primary)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {job.title || "Untitled"} at {job.company || "Unknown"}
                        </p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {job.match_score !== null && (
                            <span className="mr-2">Match: {job.match_score}%</span>
                          )}
                          {job.location && <span className="mr-2">{job.location}</span>}
                          {existingApp && (
                            <span
                              className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "rgb(5,150,105)" }}
                            >
                              Application started
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--muted-foreground)" }} />
                    </button>
                  );
                })}
              </div>
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
                    {currentApp && (
                      <span
                        className="inline-flex ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: "rgba(59,130,246,0.1)",
                          color: "rgb(59,130,246)",
                        }}
                      >
                        {currentApp.status}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => { setWorkspace(null); setSelectedAppId(null); setSelectedJob(null); }}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent shrink-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  Change
                </button>
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
                          title={`Chat with ${agent.name} about this application`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                    {workspace && (
                      <>
                        <button
                          onClick={() =>
                            apiDownload(
                              `/agents/workspaces/${workspace.id}/artifacts/${selectedArtifact.id}/export?format=docx`,
                              `${selectedArtifact.title.replace(/\s+/g, "_")}.docx`,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                          style={{ borderColor: "var(--border)" }}
                          title="Download as Word document"
                        >
                          <Download className="h-3 w-3" />
                          DOCX
                        </button>
                        <button
                          onClick={() =>
                            apiDownload(
                              `/agents/workspaces/${workspace.id}/artifacts/${selectedArtifact.id}/export?format=pdf`,
                              `${selectedArtifact.title.replace(/\s+/g, "_")}.pdf`,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                          style={{ borderColor: "var(--border)" }}
                          title="Download as PDF"
                        >
                          <Download className="h-3 w-3" />
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
    </div>
  );
}
