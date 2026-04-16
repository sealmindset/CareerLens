"use client";

import { useEffect, useState, useRef } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  Flame,
  Loader2,
  MapPin,
  MessageCircle,
  Monitor,
  Phone,
  Plus,
  Rocket,
  Send,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  User,
  Video,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/* ================================================================== */
/* MOCK DATA — Simulates what the backend will provide                 */
/* ================================================================== */

const MOCK_BRIEFING = {
  greeting: "Good afternoon, Rob.",
  summary:
    "You have an interview in 2 hours that needs prep, 1 overdue follow-up, and a new 94% match just posted. Let's get you ready.",
  urgency_level: "active", // calm | active | urgent
};

const MOCK_PRIORITY_ACTIONS = [
  {
    id: "1",
    type: "event_prep",
    urgency: "urgent",
    title: "Technical Interview — Sr. Security Engineer",
    subtitle: "Wealth Enhancement Group with Dylan Cole",
    detail: "MS Teams in 2h 15m — prep is only 40% complete",
    action_label: "Start Prep",
    action_url: "/command-center/mock-event/prep",
    icon: "zap",
    accent: "red",
  },
  {
    id: "2",
    type: "follow_up",
    urgency: "important",
    title: "Follow-up overdue: Application Architect",
    subtitle: "Target Corporation — submitted 5 days ago",
    detail: "No response since submission. JARVIS recommends a polite check-in.",
    action_label: "Draft Follow-up",
    action_url: "#",
    icon: "clock",
    accent: "amber",
  },
  {
    id: "3",
    type: "new_match",
    urgency: "opportunity",
    title: "New match: Principal Security Engineer",
    subtitle: "Stripe — posted 6 hours ago — 94% fit",
    detail: "Strong culture fit. Exceeds your compensation target. 0 deal breakers.",
    action_label: "Review Match",
    action_url: "#",
    icon: "target",
    accent: "emerald",
  },
];

const MOCK_TASKS = [
  {
    id: "t1",
    title: "Prepare STAR stories for Wealth Enhancement Group interview",
    due: "Today",
    priority: "urgent",
    source: "JARVIS",
    done: false,
  },
  {
    id: "t2",
    title: "Follow up with Sarah Kim at Acme Corp",
    due: "Tomorrow",
    priority: "important",
    source: "JARVIS",
    done: false,
  },
  {
    id: "t3",
    title: "Update resume variant for security-focused roles",
    due: "Apr 18",
    priority: "normal",
    source: "Manual",
    done: false,
  },
  {
    id: "t4",
    title: "Review and approve tailored cover letter for Netflix",
    due: "Apr 16",
    priority: "normal",
    source: "JARVIS",
    done: true,
  },
];

const MOCK_PIPELINE = [
  {
    id: "p1",
    company: "Wealth Enhancement Group",
    role: "Sr. Security Engineer",
    status: "interviewing",
    match_score: 87,
    fit_score: 82,
    next_action: "Technical Interview — Today 3:00 PM",
    stage_index: 3,
  },
  {
    id: "p2",
    company: "Target Corporation",
    role: "Application Architect",
    status: "submitted",
    match_score: 78,
    fit_score: 71,
    next_action: "Awaiting response (5 days)",
    stage_index: 2,
  },
  {
    id: "p3",
    company: "Stripe",
    role: "Principal Security Engineer",
    status: "new",
    match_score: 94,
    fit_score: 91,
    next_action: "Review and apply",
    stage_index: 0,
  },
  {
    id: "p4",
    company: "Netflix",
    role: "Sr. Platform Engineer",
    status: "tailoring",
    match_score: 82,
    fit_score: 76,
    next_action: "Cover letter ready for review",
    stage_index: 1,
  },
];

const PIPELINE_STAGES = ["New", "Preparing", "Submitted", "Interviewing", "Offer"];

const MOCK_EVENTS = [
  {
    id: "e1",
    title: "Technical Interview — Sr. Security Engineer",
    company: "Wealth Enhancement Group",
    contact: "Dylan Cole",
    platform: "ms_teams",
    countdown: "2h 15m",
    prep_status: "in_progress",
    prep_pct: 40,
    time: "Today 3:00 PM CST",
  },
  {
    id: "e2",
    title: "Phone Screen — Application Architect",
    company: "Acme Corp",
    contact: "Sarah Kim",
    platform: "phone",
    countdown: "2d 4h",
    prep_status: "not_started",
    prep_pct: 0,
    time: "Thu Apr 17, 10:00 AM CST",
  },
  {
    id: "e3",
    title: "Behavioral Interview — Platform Engineer",
    company: "Netflix",
    contact: "James Park",
    platform: "zoom",
    countdown: "5d",
    prep_status: "not_started",
    prep_pct: 0,
    time: "Mon Apr 21, 2:00 PM PST",
  },
];

const MOCK_CAPTURES = [
  {
    id: "c1",
    text: "Got a LinkedIn message from recruiter at Datadog about a Staff Security role, fully remote, wants to chat next week",
    time: "25 min ago",
    processed: false,
  },
  {
    id: "c2",
    text: "Dylan said the Wealth Enhancement panel will include the CISO and VP of Engineering",
    time: "1h ago",
    processed: true,
    result: "Updated event notes",
  },
];

const MOCK_CHAT: { role: "jarvis" | "user"; content: string }[] = [
  {
    role: "jarvis",
    content:
      "Good afternoon, Rob. You have a technical interview with Wealth Enhancement Group in about 2 hours. Your prep is at 40% — I'd recommend reviewing your STAR stories for security architecture questions. Want me to pull up your strongest stories?",
  },
];

/* ================================================================== */
/* Helper Components                                                    */
/* ================================================================== */

function UrgencyDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-500 shadow-red-500/50 shadow-sm animate-pulse",
    important: "bg-amber-500 shadow-amber-500/40 shadow-sm",
    opportunity: "bg-emerald-500 shadow-emerald-500/40 shadow-sm",
    normal: "bg-blue-400",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[level] || colors.normal}`} />;
}

function AccentBar({ color }: { color: string }) {
  const colors: Record<string, string> = {
    red: "from-red-500 to-red-600",
    amber: "from-amber-500 to-amber-600",
    emerald: "from-emerald-500 to-emerald-600",
    blue: "from-blue-500 to-blue-600",
    purple: "from-purple-500 to-purple-600",
    teal: "from-teal-500 to-teal-600",
  };
  return (
    <div
      className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b ${colors[color] || colors.blue}`}
    />
  );
}

function IconForType({ type }: { type: string }) {
  switch (type) {
    case "zap":
      return <Zap className="h-5 w-5" />;
    case "clock":
      return <Clock className="h-5 w-5" />;
    case "target":
      return <Target className="h-5 w-5" />;
    case "star":
      return <Star className="h-5 w-5" />;
    default:
      return <Circle className="h-5 w-5" />;
  }
}

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case "ms_teams":
      return <Monitor className="h-3.5 w-3.5" />;
    case "zoom":
      return <Video className="h-3.5 w-3.5" />;
    case "phone":
      return <Phone className="h-3.5 w-3.5" />;
    default:
      return <MapPin className="h-3.5 w-3.5" />;
  }
}

function ProgressRing({ pct, size = 36 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color =
    pct >= 80 ? "stroke-emerald-500" : pct >= 50 ? "stroke-amber-500" : "stroke-red-500";
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} className="stroke-muted/30" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={3}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={`${color} transition-all duration-700`}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground rotate-90 origin-center text-[9px] font-bold"
      >
        {pct}%
      </text>
    </svg>
  );
}

/* ================================================================== */
/* Main Page Component                                                  */
/* ================================================================== */

export default function CommandCenterPreview() {
  const { authMe } = useAuth();
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState(MOCK_CHAT);
  const [chatTyping, setChatTyping] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [tasks, setTasks] = useState(MOCK_TASKS);
  const [captures, setCaptures] = useState(MOCK_CAPTURES);
  const [showCapture, setShowCapture] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Greeting animation
  const [showGreeting, setShowGreeting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowGreeting(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatTyping]);

  // Simulate JARVIS response
  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");
    setChatTyping(true);
    setTimeout(() => {
      setChatTyping(false);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "jarvis",
          content:
            userMsg.toLowerCase().includes("stor")
              ? "Here are your top 3 stories for security architecture discussions:\n\n1. **Zero-Trust Migration at Sleep Number** — Led enterprise-wide zero-trust implementation across 4,000 endpoints. Reduced attack surface by 73%.\n\n2. **SOC Automation Platform** — Built automated threat response that cut mean-time-to-respond from 45 min to under 3 min.\n\n3. **Cloud Security Framework** — Designed AWS security architecture for PCI-DSS compliance. Zero audit findings.\n\nWant me to add these to your prep briefing?"
              : userMsg.toLowerCase().includes("datadog")
                ? "I saw the Datadog note you captured. Here's what I know:\n\n- **Datadog** is a $5B+ monitoring/security company, strong engineering culture\n- A Staff Security role there would likely be $250-320K+ total comp\n- That exceeds your target by ~15%\n- Culture scores high on innovation and technical depth\n\nShould I create an event for the call and start researching the role?"
                : "Got it! I'll take care of that. Anything else you need before your interview?",
        },
      ]);
    }, 1800);
  };

  // Toggle task done
  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  // Process capture (mock)
  const processCapture = (id: string) => {
    setCaptures((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, processed: true, result: "Created event + task" } : c
      )
    );
  };

  const firstName = authMe?.name?.split(" ")[0] || "Rob";

  return (
    <div className="space-y-6 pb-8">
      {/* ============================================================ */}
      {/* JARVIS GREETING BANNER                                        */}
      {/* ============================================================ */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 transition-all duration-700 ${showGreeting ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{
          background:
            "linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, var(--primary) 8%, var(--card)) 100%)",
          borderColor: "color-mix(in srgb, var(--primary) 20%, var(--border))",
        }}
      >
        {/* Subtle glow */}
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
        />

        <div className="flex items-start gap-4">
          {/* JARVIS avatar */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {MOCK_BRIEFING.greeting.replace("Rob", firstName)}
              </h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                JARVIS
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {MOCK_BRIEFING.summary}
            </p>

            {/* Quick stats row */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400">
                <Flame className="h-3 w-3" />1 urgent
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Clock className="h-3 w-3" />1 overdue
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-3 w-3" />1 new match
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                <Briefcase className="h-3 w-3" />4 active
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* PRIORITY ACTIONS                                              */}
      {/* ============================================================ */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Needs Your Attention
        </h2>
        <div className="space-y-3">
          {MOCK_PRIORITY_ACTIONS.map((action, i) => (
            <div
              key={action.id}
              className="group relative overflow-hidden rounded-xl border bg-card p-4 transition-all hover:shadow-md"
              style={{
                borderColor: "var(--border)",
                animationDelay: `${i * 100}ms`,
              }}
            >
              <AccentBar color={action.accent} />
              <div className="flex items-start gap-4 pl-3">
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    action.accent === "red"
                      ? "bg-red-500/10 text-red-600 dark:text-red-400"
                      : action.accent === "amber"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  <IconForType type={action.icon} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <UrgencyDot level={action.urgency} />
                    <h3 className="text-sm font-semibold">{action.title}</h3>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{action.subtitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground/80">{action.detail}</p>
                </div>

                {/* Action button */}
                <button className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md">
                  {action.action_label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* TWO COLUMN: TASKS + JARVIS CHAT                               */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* LEFT: Tasks + Quick Capture (3 cols) */}
        <div className="space-y-6 lg:col-span-3">
          {/* Quick Capture */}
          <div className="rounded-xl border bg-card p-5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Quick Capture
              </h2>
              {captures.filter((c) => !c.processed).length > 0 && (
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                  {captures.filter((c) => !c.processed).length} unprocessed
                </span>
              )}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && captureText.trim()) {
                    setCaptures((prev) => [
                      { id: `c${Date.now()}`, text: captureText, time: "Just now", processed: false },
                      ...prev,
                    ]);
                    setCaptureText("");
                  }
                }}
                placeholder="Drop a note... recruiter call, interview detail, anything"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => {
                  if (captureText.trim()) {
                    setCaptures((prev) => [
                      { id: `c${Date.now()}`, text: captureText, time: "Just now", processed: false },
                      ...prev,
                    ]);
                    setCaptureText("");
                  }
                }}
                className="rounded-lg bg-purple-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-purple-700"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Capture queue */}
            {captures.length > 0 && (
              <div className="mt-3 space-y-2">
                {captures.map((cap) => (
                  <div
                    key={cap.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition-all ${
                      cap.processed
                        ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/20"
                        : "border-purple-200 bg-purple-50/50 dark:border-purple-900/30 dark:bg-purple-950/20"
                    }`}
                  >
                    {cap.processed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-500 animate-pulse" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-muted-foreground">{cap.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground/60">
                        {cap.time}
                        {cap.processed && cap.result && (
                          <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                            {cap.result}
                          </span>
                        )}
                      </p>
                    </div>
                    {!cap.processed && (
                      <button
                        onClick={() => processCapture(cap.id)}
                        className="shrink-0 rounded-md bg-purple-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-purple-700"
                      >
                        Process
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task Inbox */}
          <div className="rounded-xl border bg-card p-5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                Action Items
              </h2>
              <span className="text-xs text-muted-foreground">
                {tasks.filter((t) => !t.done).length} pending
              </span>
            </div>
            <div className="space-y-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                    task.done ? "opacity-50" : "hover:bg-accent/50"
                  }`}
                >
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      task.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : task.priority === "urgent"
                          ? "border-red-400 hover:border-red-500"
                          : task.priority === "important"
                            ? "border-amber-400 hover:border-amber-500"
                            : "border-muted-foreground/30 hover:border-muted-foreground/50"
                    }`}
                  >
                    {task.done && <CheckCircle2 className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${task.done ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-xs ${
                          task.due === "Today"
                            ? "font-medium text-red-600 dark:text-red-400"
                            : task.due === "Tomorrow"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {task.due}
                      </span>
                      {task.source === "JARVIS" && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          JARVIS
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: JARVIS Chat (2 cols) */}
        <div className="lg:col-span-2">
          <div
            className="flex flex-col rounded-xl border bg-card overflow-hidden"
            style={{
              borderColor: "color-mix(in srgb, var(--primary) 20%, var(--border))",
              height: "480px",
            }}
          >
            {/* Chat header */}
            <div
              className="flex items-center gap-3 border-b px-4 py-3"
              style={{
                borderColor: "var(--border)",
                background: "color-mix(in srgb, var(--primary) 5%, var(--card))",
              }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">JARVIS</h3>
                <p className="text-[10px] text-muted-foreground">Your career assistant</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Online</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "jarvis" && (
                    <div className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-muted"
                    }`}
                  >
                    {msg.content.split("\n").map((line, j) => (
                      <p key={j} className={j > 0 ? "mt-1.5" : ""}>
                        {line.split("**").map((part, k) =>
                          k % 2 === 1 ? (
                            <strong key={k}>{part}</strong>
                          ) : (
                            <span key={k}>{part}</span>
                          )
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
              {chatTyping && (
                <div className="flex justify-start">
                  <div className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleChatSend();
                }}
                className="flex gap-2"
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask JARVIS anything..."
                  disabled={chatTyping}
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={chatTyping || !chatInput.trim()}
                  className="rounded-lg bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
                Try: &quot;Pull up my strongest stories&quot; or &quot;Tell me about Datadog&quot;
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* ACTIVE PIPELINE — Visual opportunity tracker                  */}
      {/* ============================================================ */}
      <div className="rounded-xl border bg-card p-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Rocket className="h-4 w-4 text-primary" />
            Active Pipeline
          </h2>
          <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            Compare opportunities <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {/* Stage labels */}
        <div className="mb-3 grid grid-cols-5 gap-2">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage} className="text-center">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {stage}
              </span>
            </div>
          ))}
        </div>

        {/* Pipeline cards */}
        <div className="space-y-3">
          {MOCK_PIPELINE.map((opp) => (
            <div key={opp.id} className="relative">
              {/* Progress track */}
              <div className="mb-2 grid grid-cols-5 gap-1">
                {PIPELINE_STAGES.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i <= opp.stage_index
                        ? opp.stage_index >= 3
                          ? "bg-emerald-500"
                          : "bg-primary"
                        : "bg-muted/50"
                    }`}
                  />
                ))}
              </div>
              {/* Card */}
              <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-background/50 px-4 py-3">
                {/* Fit score */}
                <ProgressRing pct={opp.fit_score} />
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">{opp.role}</h4>
                    {opp.fit_score >= 90 && (
                      <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Top Match
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{opp.company}</p>
                </div>
                {/* Next action */}
                <div className="hidden sm:block text-right">
                  <p className="text-xs text-muted-foreground">Next</p>
                  <p className="text-xs font-medium">{opp.next_action}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* UPCOMING EVENTS — Timeline with prep status                   */}
      {/* ============================================================ */}
      <div className="rounded-xl border bg-card p-5" style={{ borderColor: "var(--border)" }}>
        <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
          <CalendarClock className="h-4 w-4 text-teal-500" />
          Upcoming Events
        </h2>
        <div className="space-y-3">
          {MOCK_EVENTS.map((event, i) => (
            <div
              key={event.id}
              className="flex items-center gap-4 rounded-lg border border-border/60 bg-background/50 p-4 transition-all hover:shadow-sm"
            >
              {/* Prep ring */}
              <ProgressRing pct={event.prep_pct} />

              {/* Event info */}
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium">{event.title}</h4>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {event.contact}
                  </span>
                  <span className="flex items-center gap-1">
                    <PlatformIcon platform={event.platform} />
                    {event.platform.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {event.time}
                  </span>
                </div>
              </div>

              {/* Countdown + action */}
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    i === 0
                      ? "bg-red-500/10 text-red-600 dark:text-red-400 animate-pulse"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Clock className="mr-1 inline h-3 w-3" />
                  {event.countdown}
                </div>
                <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  {event.prep_pct > 0 ? "Continue Prep" : "Start Prep"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* FOOTER — Motivational                                         */}
      {/* ============================================================ */}
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground/50">
          JARVIS is working for you 24/7. You focus on the interviews — I&apos;ll handle the rest.
        </p>
      </div>
    </div>
  );
}
