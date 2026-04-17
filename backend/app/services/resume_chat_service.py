"""Resume chat service — coach + proposer model.

One persistent chat per (user, workspace, agent). The AI is a coach that:
  - Reviews the user's edits and asks/suggests in plain English.
  - MAY propose a revised full resume text when the user asks for a change
    or accepts a suggestion.
  - NEVER writes directly to the draft. Proposals sit as "pending" until
    the user clicks Apply (then they overwrite the draft) or Dismiss
    (then they disappear).

The user owns the textarea. Their manual edits flow into the draft on the
next Send. Publish saves the current draft as a new WorkspaceArtifact
version (pruned to MAX_ARTIFACT_VERSIONS by workspace_service.save_artifact).

Supported agents: tailor, achievement_amplifier.
"""

from __future__ import annotations

import difflib
import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.ai.agent_service import AGENT_SLUGS, DEFAULT_PROMPTS
from app.ai.errors import sanitize_ai_error
from app.ai.prompt_loader import get_prompt, get_prompt_config
from app.ai.provider import get_ai_provider, get_model_for_tier
from app.ai.sanitize import sanitize_prompt_input
from app.models.agent_conversation import AgentConversation, AgentMessage
from app.models.application import Application
from app.models.job import JobListing
from app.models.workspace import AgentWorkspace, WorkspaceArtifact
from app.services.workspace_service import save_artifact

logger = logging.getLogger(__name__)


AGENT_TRACKS = {"tailor", "achievement_amplifier"}

AGENT_ARTIFACT_TYPE = {
    "tailor": "tailored_resume",
    "achievement_amplifier": "amplified_resume",
}

AGENT_DEFAULT_TITLE = {
    "tailor": "Tailored Resume",
    "achievement_amplifier": "Amplified Resume",
}

TRACK_TO_CONTEXT_TYPE = {
    "tailor": "resume_tailoring",
    "achievement_amplifier": "resume_amplification",
}


# ─── Shapes ────────────────────────────────────────────────────────────────


@dataclass
class PublishedArtifact:
    id: uuid.UUID
    workspace_id: uuid.UUID
    artifact_type: str
    agent_name: str
    title: str
    version: int


# ─── Draft helpers ─────────────────────────────────────────────────────────


def _get_draft(convo: AgentConversation) -> dict[str, Any]:
    return dict(convo.draft_resume or {})


def get_draft_text(convo: AgentConversation) -> str:
    return str(_get_draft(convo).get("raw_resume_text") or "")


def get_pending_proposal(convo: AgentConversation) -> dict[str, Any] | None:
    pp = _get_draft(convo).get("pending_proposal")
    if not isinstance(pp, dict):
        return None
    text = pp.get("text")
    if not isinstance(text, str) or not text.strip():
        return None
    return pp


def _save_draft(
    db: AsyncSession,
    convo: AgentConversation,
    raw_resume_text: str | None = None,
    pending_proposal: dict[str, Any] | None | object = ...,  # sentinel
    loaded: dict[str, Any] | None | object = ...,
) -> None:
    draft = _get_draft(convo)
    if raw_resume_text is not None:
        draft["raw_resume_text"] = raw_resume_text
    if pending_proposal is not ...:
        if pending_proposal is None:
            draft.pop("pending_proposal", None)
        else:
            draft["pending_proposal"] = pending_proposal
    if loaded is not ...:
        if loaded is None:
            for k in (
                "loaded_artifact_id",
                "loaded_artifact_version",
                "loaded_artifact_title",
            ):
                draft.pop(k, None)
        else:
            draft.update(loaded)
    convo.draft_resume = draft
    flag_modified(convo, "draft_resume")


# ─── Chat lookup / creation ────────────────────────────────────────────────


async def _validate_workspace_access(
    db: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> AgentWorkspace:
    ws = await db.get(AgentWorkspace, workspace_id)
    if ws is None or ws.user_id != user_id:
        raise ValueError("Workspace not found")
    return ws


async def _latest_artifact_for_agent(
    db: AsyncSession, workspace_id: uuid.UUID, agent_name: str
) -> WorkspaceArtifact | None:
    artifact_type = AGENT_ARTIFACT_TYPE.get(agent_name)
    if artifact_type is None:
        return None
    result = await db.execute(
        select(WorkspaceArtifact)
        .where(
            WorkspaceArtifact.workspace_id == workspace_id,
            WorkspaceArtifact.artifact_type == artifact_type,
        )
        .order_by(WorkspaceArtifact.version.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_or_create_chat(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    agent_name: str,
) -> AgentConversation:
    """One chat per (user, workspace, agent). On creation (or if the draft
    is stale/empty) the latest artifact of this agent's type is loaded into
    the draft so the chat opens on the latest resume automatically."""
    if agent_name not in AGENT_TRACKS:
        raise ValueError(f"Unsupported agent: {agent_name}")

    workspace = await _validate_workspace_access(db, user_id, workspace_id)

    result = await db.execute(
        select(AgentConversation).where(
            and_(
                AgentConversation.user_id == user_id,
                AgentConversation.workspace_id == workspace_id,
                AgentConversation.agent_name == agent_name,
            )
        )
    )
    convo = result.scalar_one_or_none()

    latest = await _latest_artifact_for_agent(db, workspace_id, agent_name)

    if convo is None:
        application = await db.get(Application, workspace.application_id)
        job_id = application.job_listing_id if application else None
        convo = AgentConversation(
            user_id=user_id,
            agent_name=agent_name,
            context_type=TRACK_TO_CONTEXT_TYPE[agent_name],
            context_id=workspace_id,
            status="active",
            workspace_id=workspace_id,
            job_id=job_id,
            draft_resume=None,
        )
        db.add(convo)
        await db.flush()

    # If the chat has no draft yet, OR the loaded artifact version is older
    # than the current latest (e.g. the agent was re-run and produced a new
    # version), refresh the draft to match the latest artifact. This keeps
    # the chat's concept of "latest" in sync with reality.
    draft = _get_draft(convo)
    loaded_version = draft.get("loaded_artifact_version")
    loaded_id = draft.get("loaded_artifact_id")
    should_refresh = (
        latest is not None
        and (
            not draft.get("raw_resume_text")
            or not isinstance(loaded_version, int)
            or (
                isinstance(latest.version, int)
                and latest.version > loaded_version
            )
            or (str(latest.id) != str(loaded_id))
        )
    )
    if should_refresh and latest is not None:
        _save_draft(
            db,
            convo,
            raw_resume_text=latest.content or "",
            pending_proposal=None,
            loaded={
                "loaded_artifact_id": str(latest.id),
                "loaded_artifact_version": latest.version,
                "loaded_artifact_title": latest.title,
            },
        )

    await db.commit()
    await db.refresh(convo)
    return convo


async def latest_artifact_exists(
    db: AsyncSession, workspace_id: uuid.UUID, agent_name: str
) -> bool:
    return (await _latest_artifact_for_agent(db, workspace_id, agent_name)) is not None


# ─── AI call ───────────────────────────────────────────────────────────────


COACH_SYSTEM_PROMPT = """
You are in INTERACTIVE RESUME COACH MODE. The user is editing the resume
in a textarea next to this chat. You can (a) coach in plain English and
(b) optionally propose a revised full resume when the user asks for a
change or accepts one of your suggestions. You NEVER write to the resume
directly — the user must click Apply to accept your proposal.

## OUTPUT FORMAT — every turn, reply with ONE JSON object and nothing else.

{
  "reply": "<your conversational message, in plain English>",
  "proposed_resume": "<full revised resume as markdown/plain text>" | null
}

Rules for the reply field:
- Plain English, 2–4 sentences usually. Ask a question, confirm a choice,
  or offer 2–3 numbered alternative phrasings.
- If you're proposing a revised resume, say so briefly: "I've drafted a
  shorter summary — hit Apply if you like it, or tell me what to change."
- Never paste the resume into reply. The resume goes in proposed_resume.

Rules for proposed_resume:
- Set to null unless the user has asked for a specific change or clearly
  accepted one of your suggestions ("yes, shorten it", "go with option 2",
  "tighten the summary"). Ambiguous → null, ask first.
- When you do propose, return the FULL revised resume text, not a diff,
  not a fragment. The user will preview it and click Apply to overwrite.
- Change ONLY what the user asked about. Every other section must be
  IDENTICAL to the current working draft. Don't reorganize, don't add
  bullets they didn't request.
- Preserve their voice. Amplify what they wrote; don't replace it.
- Never fabricate metrics, titles, dates, companies. If a number would
  help but isn't provided, use "[quantify: ...]" as a placeholder.
- If the user asked a question (not a change request), proposed_resume
  is null — answer the question in reply.

Remember: the difference between this and a re-run is the user steers.
Most turns should be conversation — no proposed_resume. When you do
propose, keep it surgical.
""".strip()


JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _parse_agent_json(raw: str) -> dict[str, Any]:
    """Best-effort JSON extraction from the model output."""
    text = (raw or "").strip()
    m = JSON_BLOCK_RE.search(text)
    if m:
        text = m.group(1)
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"reply": (raw or "").strip(), "proposed_resume": None}
    if not isinstance(data, dict):
        return {"reply": (raw or "").strip(), "proposed_resume": None}
    reply = data.get("reply") or ""
    proposed = data.get("proposed_resume")
    if not isinstance(proposed, str) or not proposed.strip():
        proposed = None
    return {"reply": str(reply), "proposed_resume": proposed}


def _format_job(job: JobListing | None) -> str:
    if job is None:
        return "(no job pinned — give general resume advice)"
    parts = [f"**Title:** {job.title}", f"**Company:** {job.company}"]
    if job.location:
        parts.append(f"**Location:** {job.location}")
    if job.description:
        desc = job.description[:3500]
        if len(job.description) > 3500:
            desc += "\n[...truncated]"
        parts.append(f"\n**Description:**\n{desc}")
    return "\n".join(parts)


def _unified_diff(before: str, after: str) -> str:
    if before == after:
        return "(no changes since last turn)"
    diff = list(
        difflib.unified_diff(
            before.splitlines(),
            after.splitlines(),
            fromfile="previous",
            tofile="current",
            n=2,
            lineterm="",
        )
    )
    if not diff:
        return "(no changes since last turn)"
    text = "\n".join(diff)
    if len(text) > 4000:
        text = text[:4000] + "\n[...diff truncated]"
    return text


async def _call_coach(
    db: AsyncSession,
    agent_name: str,
    job: JobListing | None,
    prior_text: str,
    current_text: str,
    note: str,
    history: list[AgentMessage],
) -> dict[str, Any]:
    slug = AGENT_SLUGS.get(agent_name, f"{agent_name}-system")
    fallback = DEFAULT_PROMPTS.get(agent_name, DEFAULT_PROMPTS["tailor"])
    base_prompt = await get_prompt(db, slug, fallback)
    system_prompt = base_prompt + "\n\n" + COACH_SYSTEM_PROMPT
    temperature, max_tokens, model_tier = await get_prompt_config(db, slug)

    sections: list[str] = []
    sections.append("## Pinned Job\n" + _format_job(job))
    sections.append(
        "## Resume — user's current working draft\n"
        + (current_text.strip() or "(empty)")
    )
    sections.append(
        "## What just changed\n" + _unified_diff(prior_text, current_text)
    )
    if history:
        lines = ["## Conversation so far"]
        for m in history[-20:]:
            lines.append(f"[{m.role}] {m.content}")
        sections.append("\n".join(lines))

    if note.strip():
        sections.append(
            "## The user's note with this turn\n" + sanitize_prompt_input(note)
        )
    else:
        sections.append(
            "## The user's note with this turn\n"
            "(No note. Review the changes if any, otherwise ask what they "
            "want to work on.)"
        )

    sections.append(
        "Respond with the JSON object from your system prompt. "
        "Most turns should have proposed_resume = null."
    )
    user_prompt = "\n\n".join(sections)

    try:
        provider = get_ai_provider()
        model = get_model_for_tier(model_tier)
        raw = await provider.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as e:
        safe_error = sanitize_ai_error(e)
        logger.exception("Coach call failed (%s)", agent_name)
        raise RuntimeError(safe_error.message) from e

    return _parse_agent_json(raw)


# ─── Turns ─────────────────────────────────────────────────────────────────


async def send_turn(
    db: AsyncSession,
    convo: AgentConversation,
    resume_text: str,
    note: str,
) -> tuple[AgentMessage, AgentMessage]:
    """Record one coach turn.

    `resume_text` is the current textarea content; `note` is the user's
    optional message. Saves the draft, calls the AI, stores any new
    proposal as pending, and appends user + assistant messages.
    """
    prior_text = get_draft_text(convo)
    new_text = resume_text or ""
    prior_history = list(convo.messages)

    if not note.strip() and prior_text == new_text:
        raise ValueError(
            "Nothing to send — edit the resume or add a note before sending."
        )

    _save_draft(db, convo, raw_resume_text=new_text)

    user_content = note.strip() if note.strip() else "(edited the resume)"
    user_msg = AgentMessage(
        conversation_id=convo.id, role="user", content=user_content
    )
    db.add(user_msg)
    await db.flush()

    job = await db.get(JobListing, convo.job_id) if convo.job_id else None

    try:
        parsed = await _call_coach(
            db=db,
            agent_name=convo.agent_name,
            job=job,
            prior_text=prior_text,
            current_text=new_text,
            note=note,
            history=prior_history,
        )
    except Exception:
        logger.exception("Coach call failed; saving draft without AI reply")
        parsed = {"reply": "", "proposed_resume": None}

    reply_text = (parsed.get("reply") or "").strip()
    if not reply_text:
        reply_text = (
            "I couldn't get a coaching reply this turn, but your edit is "
            "saved. Try sending again, or tell me what you'd like me to "
            "look at."
        )

    proposed = parsed.get("proposed_resume")
    if isinstance(proposed, str) and proposed.strip():
        _save_draft(
            db,
            convo,
            pending_proposal={
                "text": proposed,
                "proposed_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        if "Apply" not in reply_text and "apply" not in reply_text:
            reply_text = (
                reply_text.rstrip()
                + "\n\n(I've drafted a revised resume — click **Apply** "
                "to accept, or **Dismiss** to keep your current draft.)"
            )
    else:
        _save_draft(db, convo, pending_proposal=None)

    assistant_msg = AgentMessage(
        conversation_id=convo.id, role="assistant", content=reply_text
    )
    db.add(assistant_msg)

    await db.commit()
    await db.refresh(user_msg)
    await db.refresh(assistant_msg)
    await db.refresh(convo)
    return user_msg, assistant_msg


async def apply_proposal(
    db: AsyncSession, convo: AgentConversation
) -> AgentMessage:
    """Accept the pending proposal: draft_text := proposal.text, clear the
    proposal, and log a system-style note in the chat so the user can see
    the action in history."""
    pp = get_pending_proposal(convo)
    if pp is None:
        raise ValueError("There's no pending proposal to apply.")
    text = str(pp.get("text") or "")
    _save_draft(
        db,
        convo,
        raw_resume_text=text,
        pending_proposal=None,
    )
    msg = AgentMessage(
        conversation_id=convo.id,
        role="assistant",
        content="(Applied my proposed revision. Review the textarea — "
        "tell me what to adjust, or hit Publish when you're happy.)",
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    await db.refresh(convo)
    return msg


async def dismiss_proposal(
    db: AsyncSession, convo: AgentConversation
) -> None:
    """Drop the pending proposal; keep the current draft as-is."""
    _save_draft(db, convo, pending_proposal=None)
    await db.commit()
    await db.refresh(convo)


# ─── Publish ───────────────────────────────────────────────────────────────


async def publish_draft(
    db: AsyncSession, convo: AgentConversation
) -> PublishedArtifact:
    """Save the current draft text as a new WorkspaceArtifact version."""
    text = get_draft_text(convo).strip()
    if not text:
        raise ValueError("Nothing to publish — the draft is empty.")
    if convo.workspace_id is None:
        raise ValueError("This chat is not attached to a workspace.")

    artifact_type = AGENT_ARTIFACT_TYPE.get(convo.agent_name)
    if artifact_type is None:
        raise ValueError(f"Unsupported agent: {convo.agent_name}")

    title: str | None = None
    draft = _get_draft(convo)
    loaded_title = draft.get("loaded_artifact_title")
    if isinstance(loaded_title, str) and loaded_title.strip():
        title = loaded_title.strip()
    if title is None:
        latest = await _latest_artifact_for_agent(
            db, convo.workspace_id, convo.agent_name
        )
        if latest is not None:
            title = latest.title
    if title is None:
        title = AGENT_DEFAULT_TITLE[convo.agent_name]

    new_art = await save_artifact(
        db=db,
        workspace_id=convo.workspace_id,
        agent_name=convo.agent_name,
        artifact_type=artifact_type,
        title=title,
        content=text,
        content_format="markdown",
    )
    # After publish, the chat's "loaded" version IS the new latest.
    _save_draft(
        db,
        convo,
        loaded={
            "loaded_artifact_id": str(new_art.id),
            "loaded_artifact_version": new_art.version,
            "loaded_artifact_title": new_art.title,
        },
    )
    await db.commit()
    await db.refresh(new_art)
    await db.refresh(convo)
    return PublishedArtifact(
        id=new_art.id,
        workspace_id=new_art.workspace_id,
        artifact_type=new_art.artifact_type,
        agent_name=new_art.agent_name,
        title=new_art.title,
        version=new_art.version,
    )
