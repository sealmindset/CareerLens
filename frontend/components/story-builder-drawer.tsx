"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import type {
  StoryBuilderChatResponse,
  StoryBuilderMessage,
  StoryBuilderPreview,
  StoryBuilderSaveResponse,
} from "@/lib/types";
import {
  X,
  Send,
  Loader2,
  BookPlus,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

export interface ParsedGap {
  title: string;
  description: string;
  severity?: string;
}

export function parseGapsFromArtifact(content: string): ParsedGap[] {
  const gaps: ParsedGap[] = [];
  const lines = content.split("\n");

  // Pattern 1: heading with explicit "Gap" keyword + colon (works anywhere)
  const explicitGapRe = /^#{1,4}\s+.*\bGap\s*\d*\s*[:.]\s*(.+?)(?:\*\*)?$/i;

  // Pattern 2: any ### heading inside a "Gaps" section
  const subHeadingRe = /^#{3,4}\s+(.+)$/;

  // Section heading that starts a gaps section
  const gapsSectionRe = /^#{1,2}\s+(?:\d+[.:]\s+)?.*\bGaps?\b/i;
  const sectionHeadingRe = /^#{1,2}\s+/;

  // Headings to skip inside a gaps section (subsection headers, strategy advice)
  const skipRe = /\bGaps\s*$/i;
  const adviceRe = /^#{3,4}\s+(?:\d+[.:]\s+)?(?:Address|Bridge|Target|Leverage|Use|De-Risk)\b/i;

  let inGapsSection = false;

  function inferSeverity(heading: string): string | undefined {
    if (/🔴|❌|critical|disqualif/i.test(heading)) return "Critical";
    if (/🟡|⚠️|important|moderate|secondary/iu.test(heading)) return "Important";
    if (/🟢|nice.to.have|minor|soft/i.test(heading)) return "Nice-to-Have";
    return undefined;
  }

  function isGapItem(line: string): boolean {
    if (skipRe.test(line)) return false;
    if (adviceRe.test(line)) return false;
    if (/\bGaps?\s+to\s+Acknowledge/i.test(line)) return false;
    return true;
  }

  function extractTitle(raw: string): string {
    return raw
      .replace(/^[\s#]+/, "")
      .replace(/^\d+[.:]\s*/, "")
      .replace(/^[^\w\s]*\s*/, "") // strip leading emoji
      .replace(/\*\*/g, "")
      .replace(/\*([^*]+)\*/g, "$1")
      .trim();
  }

  function collectGap(startIdx: number, title: string, heading: string) {
    const descLines: string[] = [];
    let severity = inferSeverity(heading);

    for (let j = startIdx + 1; j < lines.length; j++) {
      if (explicitGapRe.test(lines[j])) break;
      if (subHeadingRe.test(lines[j]) && inGapsSection) break;
      if (sectionHeadingRe.test(lines[j])) break;
      if (/^---\s*$/.test(lines[j])) break;
      const sevLine = lines[j].trim();
      if (/^\*\*Severity[:\s]/i.test(sevLine)) {
        severity = sevLine.replace(/^\*\*Severity[:\s]*\*\*\s*/i, "").trim();
      }
      descLines.push(lines[j]);
    }

    gaps.push({ title, description: descLines.join("\n").trim(), severity });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (sectionHeadingRe.test(line)) {
      inGapsSection = gapsSectionRe.test(line);
    }

    // Pattern 1: explicit "Gap" keyword (any section)
    const explicitMatch = line.match(explicitGapRe);
    if (explicitMatch) {
      const title = extractTitle(explicitMatch[1]);
      if (title) collectGap(i, title, line);
      continue;
    }

    // Pattern 2: any ### heading inside a gaps section
    if (inGapsSection && subHeadingRe.test(line) && isGapItem(line)) {
      const title = extractTitle(line);
      if (title) collectGap(i, title, line);
    }
  }

  return gaps;
}

interface Props {
  open: boolean;
  onClose: () => void;
  requirementText?: string;
  skillName?: string;
  gaps?: ParsedGap[];
  onSaved: (response?: StoryBuilderSaveResponse) => void;
}

export function StoryBuilderDrawer({
  open,
  onClose,
  requirementText: initialRequirementText = "",
  skillName: initialSkillName = "",
  gaps,
  onSaved,
}: Props) {
  const [messages, setMessages] = useState<StoryBuilderMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<StoryBuilderPreview | null>(null);
  const [editingPreview, setEditingPreview] = useState<StoryBuilderPreview | null>(null);
  const [company, setCompany] = useState("");

  const hasGaps = gaps && gaps.length > 0;
  const [selectedGap, setSelectedGap] = useState<ParsedGap | null>(null);
  const showGapPicker = hasGaps && !selectedGap;

  const requirementText = selectedGap?.description || initialRequirementText;
  const skillName = selectedGap?.title || initialSkillName;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  const startInterview = useCallback(async (reqText: string, skill: string) => {
    setSending(true);
    setErrorMsg(null);
    try {
      const resp = await apiPost<StoryBuilderChatResponse>(
        "/events/story-builder/chat",
        { requirement_text: reqText, skill_name: skill },
      );
      setMessages([{ role: "assistant", content: resp.reply }]);
      if (resp.has_structured_story && resp.structured_story) {
        setPreview(resp.structured_story);
        setEditingPreview({ ...resp.structured_story });
      }
    } catch (err) {
      console.error("Story builder init failed:", err);
      setErrorMsg("Failed to start the interview. Try again.");
    } finally {
      setSending(false);
    }
  }, []);

  const handleSelectGap = useCallback((gap: ParsedGap) => {
    setSelectedGap(gap);
    initialized.current = true;
    void startInterview(gap.description, gap.title);
  }, [startInterview]);

  useEffect(() => {
    if (open && !initialized.current && !showGapPicker) {
      initialized.current = true;
      void startInterview(requirementText, skillName);
    }
    if (!open) {
      initialized.current = false;
      setSelectedGap(null);
      setMessages([]);
      setInput("");
      setPreview(null);
      setEditingPreview(null);
      setErrorMsg(null);
      setSuccessMsg(null);
      setCompany("");
    }
  }, [open, startInterview, showGapPicker, requirementText, skillName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setErrorMsg(null);

    const userMsg: StoryBuilderMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      const resp = await apiPost<StoryBuilderChatResponse>(
        "/events/story-builder/chat",
        {
          requirement_text: requirementText,
          skill_name: skillName,
          message: text,
          history: updatedMessages,
        },
      );
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: resp.reply },
      ]);
      if (resp.has_structured_story && resp.structured_story) {
        setPreview(resp.structured_story);
        setEditingPreview({ ...resp.structured_story });

      }
    } catch (err) {
      console.error("Story builder send failed:", err);
      setErrorMsg("Send failed. Try again.");
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, requirementText, skillName]);

  const handleRevise = useCallback(async () => {
    if (sending || !editingPreview) return;
    const revisionNote = "Please revise the story based on my edits to the preview fields.";
    setInput("");
    setSending(true);
    setErrorMsg(null);

    const userMsg: StoryBuilderMessage = { role: "user", content: revisionNote };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      const resp = await apiPost<StoryBuilderChatResponse>(
        "/events/story-builder/chat",
        {
          requirement_text: requirementText,
          skill_name: skillName,
          message: revisionNote,
          history: updatedMessages,
        },
      );
      setMessages([
        ...updatedMessages,
        { role: "assistant", content: resp.reply },
      ]);
      if (resp.has_structured_story && resp.structured_story) {
        setPreview(resp.structured_story);
        setEditingPreview({ ...resp.structured_story });
      }
    } catch (err) {
      console.error("Story builder revise failed:", err);
      setErrorMsg("Revision failed. Try again.");
    } finally {
      setSending(false);
    }
  }, [sending, editingPreview, messages, requirementText, skillName]);

  const handleSave = useCallback(async () => {
    if (!editingPreview || saving) return;
    if (
      !editingPreview.story_title?.trim() ||
      !editingPreview.problem?.trim() ||
      !editingPreview.solved?.trim() ||
      !editingPreview.deployed?.trim()
    ) {
      setErrorMsg("Story Title, Problem, Solved, and Deployed are required.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const resp = await apiPost<StoryBuilderSaveResponse>(
        "/events/story-builder/save",
        {
          requirement_text: requirementText,
          skill_name: skillName,
          resume_bullet: editingPreview.resume_bullet || "",
          story_title: editingPreview.story_title,
          problem: editingPreview.problem,
          solved: editingPreview.solved,
          deployed: editingPreview.deployed,
          takeaway: editingPreview.takeaway || null,
          trigger_keywords: editingPreview.trigger_keywords || null,
          proof_metric: editingPreview.proof_metric || null,
          source_company: company || null,
        },
      );
      setSuccessMsg(`Saved "${resp.story_title}" to Story Bank`);
      window.dispatchEvent(new CustomEvent("story-bank-refresh"));
      setTimeout(() => onSaved(resp), 1500);
    } catch (err) {
      console.error("Story builder save failed:", err);
      setErrorMsg("Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }, [editingPreview, saving, requirementText, skillName, company, onSaved]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative flex flex-col rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--background)",
          width: "85vw",
          height: "85vh",
          maxWidth: "1200px",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                backgroundColor: "rgba(245,158,11,0.15)",
                color: "rgb(245,158,11)",
              }}
            >
              <BookPlus className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm">AI Story Builder</h2>
              <p
                className="text-xs truncate max-w-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                {skillName || "Address a gap with a new Story Bank entry"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Requirement context */}
        {requirementText && !showGapPicker && (
          <div
            className="border-b px-5 py-2 text-xs"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "rgba(245,158,11,0.05)",
              color: "var(--muted-foreground)",
            }}
          >
            <span className="font-medium" style={{ color: "rgb(180,83,9)" }}>
              Gap:
            </span>{" "}
            {skillName || requirementText}
          </div>
        )}

        {/* Gap picker */}
        {showGapPicker && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-lg space-y-2">
              <p className="text-sm font-medium mb-4">Select a gap to build a story for:</p>
              {gaps.map((gap, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectGap(gap)}
                  className="w-full text-left rounded-lg border p-4 transition-colors hover:bg-accent group"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{gap.title}</p>
                        {gap.severity && (
                          <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                            {gap.severity}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Two-column body: AI Chat (left) + Story Preview (right) */}
        {!showGapPicker && <div className="flex flex-1 min-h-0">
          {/* LEFT: AI Interview Chat */}
          <div
            className="flex flex-1 flex-col"
            style={{ borderRight: editingPreview ? "1px solid var(--border)" : "none" }}
          >
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              {messages.length === 0 && sending && (
                <div className="flex flex-col items-center justify-center py-12 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <Loader2 className="mb-3 h-6 w-6 animate-spin" style={{ color: "rgb(245,158,11)" }} />
                  <p className="font-medium">AI Story Coach is preparing your interview...</p>
                  <p className="mt-1 text-xs">It will ask targeted questions to build your story</p>
                </div>
              )}
              {messages.length === 0 && !sending && errorMsg && (
                <div className="flex flex-col items-center justify-center py-12 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <p className="font-medium text-red-600">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => { setErrorMsg(null); void startInterview(requirementText, skillName); }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-relaxed ${
                      m.role === "assistant" ? "flex items-start gap-2" : ""
                    }`}
                    style={
                      m.role === "user"
                        ? { backgroundColor: "rgba(245,158,11,0.12)" }
                        : {
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                          }
                    }
                  >
                    {m.role === "assistant" && (
                      <span
                        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: "rgb(245,158,11)" }}
                      >
                        AI
                      </span>
                    )}
                    <span>{m.content}</span>
                  </div>
                </div>
              ))}
              {sending && messages.length > 0 && (
                <div className="flex justify-start">
                  <div
                    className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
                    style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
                  >
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: "rgb(245,158,11)" }}
                    >
                      AI
                    </span>
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: "rgb(245,158,11)" }} />
                    <span style={{ color: "var(--muted-foreground)" }}>Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Status banners */}
            {errorMsg && messages.length > 0 && (
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
            {successMsg && (
              <div
                className="border-t px-4 py-3 text-xs flex items-center justify-between"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "rgba(16,185,129,0.08)",
                  color: "rgb(5,122,85)",
                }}
              >
                <span>
                  <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5" />
                  {successMsg}
                </span>
                <a
                  href="/stories"
                  className="font-medium underline hover:no-underline"
                  style={{ color: "rgb(5,122,85)" }}
                >
                  View in Story Bank →
                </a>
              </div>
            )}

            {/* Composer */}
            <div
              className="border-t p-3"
              style={{ borderColor: "var(--border)" }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  editingPreview
                    ? "Ask the AI to revise, add details, or continue the conversation..."
                    : "Answer the AI's question about your experience..."
                }
                rows={3}
                disabled={sending || !!successMsg}
                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-50"
                style={{ borderColor: "var(--border)" }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  Press Enter to send, Shift+Enter for new line
                </span>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim() || !!successMsg}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "rgb(245,158,11)" }}
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

          {/* RIGHT: Story Preview (appears when AI produces structured story) */}
          {editingPreview && (
            <div
              className="flex w-[400px] shrink-0 flex-col overflow-y-auto"
              style={{ backgroundColor: "rgba(245,158,11,0.03)" }}
            >
              <div
                className="flex items-center gap-2 border-b px-4 py-3"
                style={{ borderColor: "var(--border)" }}
              >
                <CheckCircle2
                  className="h-4 w-4"
                  style={{ color: "rgb(22,163,74)" }}
                />
                <span className="text-sm font-semibold">Story Preview</span>
                <span className="ml-auto text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  Edit any field before saving
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                <StoryField
                  label="Resume Bullet"
                  value={editingPreview.resume_bullet || ""}
                  onChange={(v) =>
                    setEditingPreview({ ...editingPreview, resume_bullet: v })
                  }
                  rows={2}
                />
                <StoryField
                  label="Story Title"
                  value={editingPreview.story_title || ""}
                  onChange={(v) =>
                    setEditingPreview({ ...editingPreview, story_title: v })
                  }
                  rows={1}
                />
                <StoryField
                  label="Problem (The Hook)"
                  value={editingPreview.problem || ""}
                  onChange={(v) =>
                    setEditingPreview({ ...editingPreview, problem: v })
                  }
                  rows={3}
                />
                <StoryField
                  label="Solved (The Differentiator)"
                  value={editingPreview.solved || ""}
                  onChange={(v) =>
                    setEditingPreview({ ...editingPreview, solved: v })
                  }
                  rows={3}
                />
                <StoryField
                  label="Deployed (The Proof)"
                  value={editingPreview.deployed || ""}
                  onChange={(v) =>
                    setEditingPreview({ ...editingPreview, deployed: v })
                  }
                  rows={3}
                />
                <StoryField
                  label="Key Takeaway"
                  value={editingPreview.takeaway || ""}
                  onChange={(v) =>
                    setEditingPreview({ ...editingPreview, takeaway: v })
                  }
                  rows={2}
                />
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Company (optional)
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div
                className="flex items-center gap-2 border-t px-4 py-3"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || sending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <BookPlus className="h-3 w-3" />
                  )}
                  Save to Story Bank
                </button>
                <button
                  type="button"
                  onClick={handleRevise}
                  disabled={saving || sending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  Ask AI to Revise
                </button>
              </div>
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}

function StoryField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-relaxed"
      />
    </div>
  );
}
