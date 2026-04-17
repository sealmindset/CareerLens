"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import type {
  ResumeChatAgent,
  ResumeChatApplyResponse,
  ResumeChatMessage,
  ResumeChatPublishResponse,
  ResumeChatSendResponse,
  ResumeChatState,
} from "@/lib/types";
import {
  X,
  Send,
  Loader2,
  Wand2,
  Sparkles,
  Eye,
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  agent: ResumeChatAgent;
  workspaceId: string;
  onPublished?: (resp: ResumeChatPublishResponse) => void;
}

const AGENT_LABEL: Record<ResumeChatAgent, string> = {
  tailor: "Tailor",
  achievement_amplifier: "Achievement Amplifier",
};

const AGENT_ICON: Record<ResumeChatAgent, typeof Wand2> = {
  tailor: Wand2,
  achievement_amplifier: Sparkles,
};

export function ResumeChatDrawer({
  open,
  onClose,
  agent,
  workspaceId,
  onPublished,
}: Props) {
  const AgentIcon = AGENT_ICON[agent];

  const [chat, setChat] = useState<ResumeChatState | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [draftText, setDraftText] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const [applying, setApplying] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [showProposalPreview, setShowProposalPreview] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initKeyRef = useRef<string | null>(null);

  const initKey = useMemo(
    () => (open ? `${agent}|${workspaceId}` : null),
    [open, agent, workspaceId],
  );

  const initialize = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setPublishMsg(null);
    try {
      const state = await apiPost<ResumeChatState>("/resume-chat/chats", {
        agent_name: agent,
        workspace_id: workspaceId,
      });
      setChat(state);
      setDraftText(state.draft_resume_text || "");
    } catch (err) {
      console.error("Resume chat init failed", err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to open the resume chat. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [agent, workspaceId]);

  useEffect(() => {
    if (initKey && initKeyRef.current !== initKey) {
      initKeyRef.current = initKey;
      void initialize();
    }
    if (!open) {
      initKeyRef.current = null;
      setShowProposalPreview(false);
    }
  }, [initKey, open, initialize]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat?.messages.length]);

  const draftChanged = !!chat && draftText !== (chat.draft_resume_text || "");
  const pending = chat?.pending_proposal ?? null;

  const handleSend = useCallback(async () => {
    if (!chat) return;
    if (!note.trim() && !draftChanged) {
      setErrorMsg("Edit the resume or type a note before sending.");
      return;
    }
    setSending(true);
    setErrorMsg(null);
    setPublishMsg(null);
    try {
      const resp = await apiPost<ResumeChatSendResponse>(
        `/resume-chat/chats/${chat.id}/send`,
        { resume_text: draftText, note },
      );
      const newMessages: ResumeChatMessage[] = [
        ...chat.messages,
        resp.user_message,
        resp.assistant_message,
      ];
      setChat({
        ...chat,
        draft_resume_text: resp.draft_resume_text,
        pending_proposal: resp.pending_proposal,
        messages: newMessages,
      });
      setDraftText(resp.draft_resume_text);
      setNote("");
      setShowProposalPreview(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Send failed. Try again in a moment.",
      );
    } finally {
      setSending(false);
    }
  }, [chat, draftChanged, draftText, note]);

  const handleApply = useCallback(async () => {
    if (!chat || !pending) return;
    setApplying(true);
    setErrorMsg(null);
    try {
      const resp = await apiPost<ResumeChatApplyResponse>(
        `/resume-chat/chats/${chat.id}/apply`,
        {},
      );
      setChat({
        ...chat,
        draft_resume_text: resp.draft_resume_text,
        pending_proposal: null,
        messages: [...chat.messages, resp.assistant_message],
      });
      setDraftText(resp.draft_resume_text);
      setShowProposalPreview(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Couldn't apply the proposed revision.",
      );
    } finally {
      setApplying(false);
    }
  }, [chat, pending]);

  const handleDismiss = useCallback(async () => {
    if (!chat || !pending) return;
    setDismissing(true);
    setErrorMsg(null);
    try {
      const updated = await apiPost<ResumeChatState>(
        `/resume-chat/chats/${chat.id}/dismiss`,
        {},
      );
      setChat(updated);
      setDraftText(updated.draft_resume_text || "");
      setShowProposalPreview(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Couldn't dismiss the proposal.",
      );
    } finally {
      setDismissing(false);
    }
  }, [chat, pending]);

  const handlePublish = useCallback(async () => {
    if (!chat) return;
    if (draftChanged) {
      try {
        const resp = await apiPost<ResumeChatSendResponse>(
          `/resume-chat/chats/${chat.id}/send`,
          {
            resume_text: draftText,
            note: "(publishing this version — quick review appreciated)",
          },
        );
        const newMessages: ResumeChatMessage[] = [
          ...chat.messages,
          resp.user_message,
          resp.assistant_message,
        ];
        setChat({
          ...chat,
          draft_resume_text: resp.draft_resume_text,
          pending_proposal: resp.pending_proposal,
          messages: newMessages,
        });
        setDraftText(resp.draft_resume_text);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Couldn't save your edits before publishing.",
        );
        return;
      }
    }
    setPublishing(true);
    setErrorMsg(null);
    setPublishMsg(null);
    try {
      const resp = await apiPost<ResumeChatPublishResponse>(
        `/resume-chat/chats/${chat.id}/publish`,
        {},
      );
      setPublishMsg(
        `Published ${resp.title} v${resp.version}. It's now the latest version of this resume.`,
      );
      setChat((prev) =>
        prev
          ? {
              ...prev,
              loaded_artifact_id: resp.artifact_id,
              loaded_artifact_version: resp.version,
              loaded_artifact_title: resp.title,
            }
          : prev,
      );
      onPublished?.(resp);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Publish failed.",
      );
    } finally {
      setPublishing(false);
    }
  }, [chat, draftChanged, draftText, onPublished]);

  if (!open) return null;

  const versionLabel = chat?.loaded_artifact_version
    ? `${chat.loaded_artifact_title ?? "Resume"} v${chat.loaded_artifact_version}`
    : "Latest";

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="ml-auto flex h-full w-full max-w-6xl flex-col border-l shadow-2xl"
        style={{ backgroundColor: "var(--background)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
              style={{
                backgroundColor:
                  agent === "tailor"
                    ? "rgba(139,92,246,0.15)"
                    : "rgba(236,72,153,0.15)",
                color:
                  agent === "tailor" ? "rgb(139,92,246)" : "rgb(236,72,153)",
              }}
            >
              <AgentIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm">
                Chat with {AGENT_LABEL[agent]}
              </h2>
              <p
                className="text-xs truncate"
                style={{ color: "var(--muted-foreground)" }}
              >
                Editing {versionLabel} — you drive, I coach.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePublish}
              disabled={
                publishing ||
                loading ||
                sending ||
                applying ||
                dismissing ||
                !chat ||
                !draftText.trim()
              }
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
              style={{
                backgroundColor:
                  agent === "tailor" ? "rgb(139,92,246)" : "rgb(236,72,153)",
              }}
              title="Save the current edit as a new version of this resume"
            >
              {publishing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Publish
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: resume editor */}
          <div
            className="flex flex-1 flex-col border-r"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-2"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                <FileText className="h-3.5 w-3.5" />
                {showPreview ? "Preview" : "Edit"}
                {draftChanged && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: "rgba(234,179,8,0.15)",
                      color: "rgb(161,98,7)",
                    }}
                  >
                    unsaved edits
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
                style={{ borderColor: "var(--border)" }}
                title="Toggle preview to see how it will look when downloaded"
              >
                <Eye className="h-3 w-3" />
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening chat…
                </div>
              ) : showPreview ? (
                <pre
                  className="whitespace-pre-wrap p-5 font-serif text-sm leading-relaxed"
                  style={{ color: "var(--foreground)" }}
                >
                  {draftText || "(empty)"}
                </pre>
              ) : (
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  spellCheck
                  className="h-full w-full resize-none border-0 bg-transparent p-5 font-mono text-sm leading-relaxed outline-none"
                  placeholder="Your resume will appear here. Edit freely."
                />
              )}
            </div>
          </div>

          {/* Right: chat */}
          <div className="flex w-[420px] flex-col">
            <div
              className="border-b px-4 py-2 text-xs font-medium"
              style={{ borderColor: "var(--border)" }}
            >
              Coach
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              {chat?.messages.length === 0 && !loading && (
                <div
                  className="rounded-lg border p-3 text-xs"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Edit the resume on the left, or type a question below, then
                  hit Send. I'll review your change, ask if anything is
                  ambiguous, and can propose a revised resume when you ask —
                  you always click Apply to accept.
                </div>
              )}
              {chat?.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                    style={
                      m.role === "user"
                        ? {
                            backgroundColor:
                              agent === "tailor"
                                ? "rgba(139,92,246,0.12)"
                                : "rgba(236,72,153,0.12)",
                          }
                        : {
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                          }
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Pending proposal banner */}
            {pending && (
              <div
                className="border-t px-4 py-3"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "rgba(59,130,246,0.08)",
                }}
              >
                <div className="mb-2 flex items-start gap-2 text-xs">
                  <Sparkles
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: "rgb(37,99,235)" }}
                  />
                  <div className="min-w-0">
                    <p className="font-medium" style={{ color: "rgb(30,64,175)" }}>
                      Revised resume ready for your review
                    </p>
                    <p
                      className="mt-0.5"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Apply replaces your draft with my version. Dismiss keeps
                      your current draft untouched.
                    </p>
                  </div>
                </div>
                {showProposalPreview && (
                  <pre
                    className="mb-2 max-h-48 overflow-auto rounded-md border p-2 text-[11px] leading-relaxed"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--card)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {pending.text}
                  </pre>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={applying || dismissing}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: "rgb(37,99,235)" }}
                  >
                    {applying ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    disabled={applying || dismissing}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {dismissing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProposalPreview((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <Eye className="h-3 w-3" />
                    {showProposalPreview ? "Hide" : "Preview"}
                  </button>
                </div>
              </div>
            )}

            {/* Status banners */}
            {errorMsg && (
              <div
                className="border-t px-4 py-2 text-xs"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "rgba(239,68,68,0.08)",
                  color: "rgb(185,28,28)",
                }}
              >
                {errorMsg}
              </div>
            )}
            {publishMsg && (
              <div
                className="border-t px-4 py-2 text-xs"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  color: "rgb(5,122,85)",
                }}
              >
                {publishMsg}
              </div>
            )}

            {/* Composer */}
            <div
              className="border-t p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ask a question or describe what you just changed… (optional)"
                rows={2}
                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--border)" }}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {draftChanged
                    ? "Send to save edits and get coaching."
                    : "Send to get coaching on the current draft."}
                </p>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={
                    sending ||
                    loading ||
                    !chat ||
                    (!draftChanged && !note.trim())
                  }
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                  style={{
                    backgroundColor:
                      agent === "tailor"
                        ? "rgb(139,92,246)"
                        : "rgb(236,72,153)",
                  }}
                >
                  {sending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
