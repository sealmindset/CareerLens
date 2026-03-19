"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRelative } from "@/lib/utils";
import type { AgentConversation, AgentMessage } from "@/lib/types";
import {
  Search,
  Scissors,
  GraduationCap,
  Target,
  Building,
  ClipboardList,
  ArrowLeft,
  Send,
  Loader2,
  MessageSquare,
  ChevronLeft,
} from "lucide-react";

interface AgentDef {
  name: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  description: string;
  modelTier: string;
  color: string;
}

const agents: AgentDef[] = [
  {
    name: "Scout",
    icon: Search,
    description: "Analyzes job listings against your profile, identifies matches, and discovers opportunities.",
    modelTier: "standard",
    color: "rgb(59,130,246)",
  },
  {
    name: "Tailor",
    icon: Scissors,
    description: "Rewrites your resume and cover letter to match the job listing language authentically.",
    modelTier: "premium",
    color: "rgb(139,92,246)",
  },
  {
    name: "Coach",
    icon: GraduationCap,
    description: "Prepares you for interviews with practice questions and feedback on your answers.",
    modelTier: "standard",
    color: "rgb(16,185,129)",
  },
  {
    name: "Strategist",
    icon: Target,
    description: "Advises on career moves, salary negotiation, and long-term career planning.",
    modelTier: "premium",
    color: "rgb(234,179,8)",
  },
  {
    name: "Brand Advisor",
    icon: Building,
    description: "Improves your LinkedIn profile, online presence, and personal brand strategy.",
    modelTier: "standard",
    color: "rgb(236,72,153)",
  },
  {
    name: "Coordinator",
    icon: ClipboardList,
    description: "Orchestrates the application process: fills forms, tracks deadlines, manages follow-ups.",
    modelTier: "premium",
    color: "rgb(249,115,22)",
  },
];

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

export default function AgentsPage() {
  const { hasPermission } = useAuth();
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

  const canChat = hasPermission("agents", "chat") || hasPermission("agents", "view");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = useCallback(async (agentName: string) => {
    setLoadingConvos(true);
    try {
      const data = await apiGet<AgentConversation[]>(`/agents/${agentName.toLowerCase()}/conversations`);
      setConversations(data);
    } catch (err) {
      console.error("Failed to load conversations:", err);
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
    } catch (err) {
      console.error("Failed to load messages:", err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const openAgent = async (agent: AgentDef) => {
    setActiveAgent(agent);
    setActiveConversation(null);
    setMessages([]);
    await fetchConversations(agent.name);
  };

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

    // Optimistic add
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
      // Replace optimistic with real messages
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempMsg.id),
        response.user_message,
        response.assistant_message,
      ]);
    } catch (err) {
      console.error("Failed to send message:", err);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  // Agent grid view
  if (!activeAgent) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Chat with specialized AI agents to supercharge your job search.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <button
              key={agent.name}
              onClick={() => openAgent(agent)}
              className="rounded-xl border p-6 text-left transition-colors hover:border-primary/50"
              style={{
                backgroundColor: "var(--card)",
                borderColor: "var(--border)",
                color: "var(--card-foreground)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
                >
                  <agent.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{agent.name}</h3>
                  {tierBadge(agent.modelTier)}
                </div>
              </div>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {agent.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Chat header */}
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setActiveAgent(null)}
          className="rounded p-1 transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
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
                          {convo.context_type}
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
                            msg.role === "user"
                              ? "var(--primary)"
                              : "var(--accent)",
                          color:
                            msg.role === "user"
                              ? "var(--primary-foreground)"
                              : "var(--accent-foreground)",
                        }}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p
                          className="text-xs mt-1 opacity-60"
                        >
                          {formatRelative(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div
                className="border-t p-4"
                style={{ borderColor: "var(--border)" }}
              >
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
                    placeholder={`Message ${activeAgent.name}...`}
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
