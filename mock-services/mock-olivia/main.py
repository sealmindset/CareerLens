"""Mock Olivia (Paradox.ai) -- Conversational job application chatbot.

Simulates the Paradox.ai Olivia widget API for local development and testing.
Supports the full conversation flow: greeting → name → phone → email →
work auth → experience → relocation → salary → resume → confirmation.
"""

import json
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

app = FastAPI(title="Mock Olivia (Paradox.ai)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BOT_NAME = os.environ.get("MOCK_OLIVIA_BOT_NAME", "Megan")
COMPANY_NAME = os.environ.get("MOCK_OLIVIA_COMPANY_NAME", "TestCorp")
WIDGET_ID = os.environ.get("MOCK_OLIVIA_WIDGET_ID", "mockwidget001")
EXTERNAL_URL = os.environ.get("MOCK_OLIVIA_EXTERNAL_URL", "http://localhost:10191")

# ─── Conversation State Machine ─────────────────────────────────────────────


class Step(str, Enum):
    GREETING = "greeting"
    NAME = "name"
    PHONE = "phone"
    EMAIL = "email"
    WORK_AUTH = "work_auth"
    SPONSORSHIP = "sponsorship"
    EXPERIENCE = "experience"
    RELOCATE = "relocate"
    SALARY = "salary"
    RESUME = "resume"
    CONFIRM = "confirm"
    DONE = "done"


STEP_ORDER = list(Step)

STEP_QUESTIONS = {
    Step.NAME: f"Hi! I'm {BOT_NAME}, your personal AI job assistant at {COMPANY_NAME}! I'm happy to help you apply for the position. To get started, can you provide your First and Last Name?",
    Step.PHONE: "Perfect, {{first_name}}! What would be the best mobile number to reach you at?",
    Step.EMAIL: "Great, thanks! Could you provide me with your email address?",
    Step.WORK_AUTH: "Are you legally authorized to work in the United States?",
    Step.SPONSORSHIP: "Will you now or in the future require sponsorship for employment visa status?",
    Step.EXPERIENCE: "How many years of relevant experience do you have for this role?",
    Step.RELOCATE: "Are you open to relocation if required for this position?",
    Step.SALARY: "What are your salary expectations for this role?",
    Step.RESUME: "Would you like to upload your resume? You can attach it here, or type 'skip' to continue without one.",
    Step.CONFIRM: "Thank you for applying, {{first_name}}! Your application for **{{job_title}}** at **{{company}}** has been submitted. A recruiter will review your information and reach out soon. Good luck! 🎉",
    Step.DONE: "Your application has already been submitted. Is there anything else I can help you with?",
}

PHONE_RE = re.compile(r"^[\d\s\-\(\)\+\.]{7,20}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Real Paradox.ai rejects 555 numbers AND Jenny's number (867-5309)
REJECTED_PHONE_PATTERNS = [
    re.compile(r"555"),           # Reserved test prefix
    re.compile(r"867[\-\s]?5309"),  # Jenny's number
]

PHONE_RETRY_MESSAGES = [
    "I'm sorry, that doesn't look like a valid phone number. Can you please provide me with your number again?",
    "I'd love to put you in touch with a recruiter, but first I need your mobile phone number.",
    "In order to get you to the right person, I'll need your mobile phone number.",
    "If you'd like to talk with a recruiter, I can forward your information. What's your mobile phone number so they can reach out?",
    "I'd like to have the ability for a recruiter to follow up so I need to get your mobile phone number.",
]


@dataclass
class ConversationState:
    session_id: str = ""
    conversation_id: int = 0
    current_step: Step = Step.GREETING
    candidate_data: dict = field(default_factory=dict)
    messages: list[dict] = field(default_factory=list)
    job_id: str = ""
    job_title: str = "Software Engineer"
    company: str = COMPANY_NAME
    created_at: float = 0
    msg_counter: int = 0


# In-memory session store
sessions: dict[str, ConversationState] = {}


def _new_session(job_id: str = "", job_title: str = "Software Engineer") -> ConversationState:
    session_id = str(uuid.uuid4())
    conv_id = int(time.time() * 1000) % 10000000
    state = ConversationState(
        session_id=session_id,
        conversation_id=conv_id,
        current_step=Step.GREETING,
        job_id=job_id,
        job_title=job_title,
        company=COMPANY_NAME,
        created_at=time.time(),
    )
    # Add greeting messages
    greeting = f"Hi! I'm {BOT_NAME}, your personal AI job assistant at {COMPANY_NAME}! Thanks for stopping by!"
    question = f"I'm happy to help you apply for the position, just need some additional information! To get started, can you provide your First and Last Name?"
    state.messages.append(_bot_msg(state, greeting))
    state.messages.append(_bot_msg(state, question))
    state.current_step = Step.NAME
    sessions[session_id] = state
    return state


def _bot_msg(state: ConversationState, text: str, question_id: int = 0) -> dict:
    state.msg_counter += 1
    msg_id = int(time.time() * 1000) + state.msg_counter
    return {
        "id": f"ours{msg_id}",
        "org_id": str(msg_id),
        "msg_uuid": f"mock{state.msg_counter:04d}",
        "type": "ours",
        "text": text,
        "text_translated": "",
        "timestamp": int(time.time() * 1000),
        "olivia_thumb": "",
        "ai_avatar_url": "",
        "from_ai": True,
        "from_lead": False,
        "from_recr": False,
        "question_id": question_id,
        "is_screening_question": False,
        "msg_type": 1,
        "delivery_type": 2,
    }


def _user_msg(state: ConversationState, text: str) -> dict:
    state.msg_counter += 1
    return {
        "id": f"theirs{state.msg_counter}",
        "org_id": str(state.msg_counter),
        "type": "theirs",
        "text": text,
        "timestamp": int(time.time() * 1000),
    }


def _format_question(step: Step, state: ConversationState) -> str:
    template = STEP_QUESTIONS.get(step, "")
    return template.replace(
        "{{first_name}}", state.candidate_data.get("first_name", "there")
    ).replace(
        "{{job_title}}", state.job_title
    ).replace(
        "{{company}}", state.company
    )


def _next_step(step: Step) -> Step:
    idx = STEP_ORDER.index(step)
    if idx + 1 < len(STEP_ORDER):
        return STEP_ORDER[idx + 1]
    return Step.DONE


def _process_answer(state: ConversationState, message: str) -> list[dict]:
    """Process user message and return bot response messages."""
    step = state.current_step
    new_messages: list[dict] = []

    # Add user message
    user_msg = _user_msg(state, message)
    state.messages.append(user_msg)
    new_messages.append(user_msg)

    if step == Step.DONE:
        bot = _bot_msg(state, _format_question(Step.DONE, state))
        state.messages.append(bot)
        new_messages.append(bot)
        return new_messages

    # Validate and extract data based on current step
    validation_error = None

    if step == Step.NAME:
        parts = message.strip().split(None, 1)
        if len(parts) >= 1:
            state.candidate_data["first_name"] = parts[0]
            state.candidate_data["last_name"] = parts[1] if len(parts) > 1 else ""
            state.candidate_data["full_name"] = message.strip()
        else:
            validation_error = "Could you please provide your first and last name?"

    elif step == Step.PHONE:
        cleaned = message.strip()
        # Real Paradox.ai rejects 555 and 867-5309 with varied retry messages
        is_valid_phone = PHONE_RE.match(cleaned) and not any(
            p.search(cleaned) for p in REJECTED_PHONE_PATTERNS
        )
        # Real bot also accepts email during phone step (stores it, still asks for phone)
        if EMAIL_RE.match(cleaned):
            state.candidate_data["email"] = cleaned
            validation_error = "Thanks for providing me with your email address. May I please have your phone number as well?"
        elif is_valid_phone:
            state.candidate_data["phone"] = cleaned
        else:
            # Cycle through varied retry messages like the real bot
            retry_count = state.candidate_data.get("_phone_retries", 0)
            if cleaned == "867-5309" or "8675309" in cleaned.replace("-", "").replace(" ", ""):
                validation_error = "Hey, nice try but you're not Jenny. You must have saw her name and number on the wall. Can we try again, what's your number?"
            else:
                validation_error = PHONE_RETRY_MESSAGES[retry_count % len(PHONE_RETRY_MESSAGES)]
            state.candidate_data["_phone_retries"] = retry_count + 1

    elif step == Step.EMAIL:
        if EMAIL_RE.match(message.strip()):
            state.candidate_data["email"] = message.strip()
        else:
            validation_error = "That doesn't look like a valid email address. Could you try again?"

    elif step == Step.WORK_AUTH:
        answer = message.strip().lower()
        if answer in ("yes", "y", "true"):
            state.candidate_data["work_authorized"] = True
        elif answer in ("no", "n", "false"):
            state.candidate_data["work_authorized"] = False
        else:
            validation_error = "Please answer with Yes or No. Are you legally authorized to work in the United States?"

    elif step == Step.SPONSORSHIP:
        answer = message.strip().lower()
        if answer in ("yes", "y", "true"):
            state.candidate_data["needs_sponsorship"] = True
        elif answer in ("no", "n", "false"):
            state.candidate_data["needs_sponsorship"] = False
        else:
            validation_error = "Please answer with Yes or No. Will you require sponsorship?"

    elif step == Step.EXPERIENCE:
        # Accept any number-like response
        nums = re.findall(r"\d+", message)
        if nums:
            state.candidate_data["years_experience"] = int(nums[0])
        else:
            state.candidate_data["years_experience_text"] = message.strip()

    elif step == Step.RELOCATE:
        answer = message.strip().lower()
        if answer in ("yes", "y", "true", "open", "sure"):
            state.candidate_data["willing_to_relocate"] = True
        else:
            state.candidate_data["willing_to_relocate"] = False

    elif step == Step.SALARY:
        state.candidate_data["salary_expectation"] = message.strip()

    elif step == Step.RESUME:
        lower = message.strip().lower()
        if lower in ("skip", "no", "n", "no thanks"):
            state.candidate_data["resume_uploaded"] = False
        else:
            state.candidate_data["resume_text"] = message.strip()
            state.candidate_data["resume_uploaded"] = True

    elif step == Step.CONFIRM:
        # Already confirmed, move to done
        pass

    # If validation failed, re-ask
    if validation_error:
        bot = _bot_msg(state, validation_error)
        state.messages.append(bot)
        new_messages.append(bot)
        return new_messages

    # Move to next step
    next_step = _next_step(step)
    state.current_step = next_step

    # Generate next question
    question = _format_question(next_step, state)
    if question:
        bot = _bot_msg(state, question)
        state.messages.append(bot)
        new_messages.append(bot)

    return new_messages


# ─── API Endpoints (matching Paradox.ai's API) ──────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "service": "mock-olivia"}


@app.get("/api/job-posting/get-widget-rules")
async def get_widget_rules(widget_id: str = ""):
    return {
        "widget_labels": [],
        "widget_targets": [],
        "catch_all_on": 1,
        "catch_all_conversation_id": 1955487,
        "job_req_id_rule": None,
        "job_title_rule": None,
        "job_loc_code_rule": None,
        "is_mapping_job_req_id": False,
        "page_language_targeting_on": 0,
        "need_check_domain": True,
        "whitelist_domains": "olivia.paradox.ai",
        "success": True,
    }


@app.get("/api/widget/{widget_id}")
async def get_widget(widget_id: str, source: int = 2, conversation_id: int = 0, job_id: str = "mock-job-001"):
    """Initialize or resume a widget session."""
    # Check for existing session by conversation_id
    state = None
    for s in sessions.values():
        if s.conversation_id == conversation_id:
            state = s
            break

    if not state:
        state = _new_session(job_id=job_id)

    session_token = f"mock-session-{state.session_id}"

    return {
        "candidate": {
            "lead_short_name": state.candidate_data.get("first_name", " "),
            "lead_name": state.candidate_data.get("full_name", ""),
            "latest_message_id": state.msg_counter,
            "xhr_enabled": True,
            "texting_enabled": True,
            "upload_enabled": True,
            "allow_media": False,
            "candidate_id": 0,
            "candidate_uuid": "",
            "session_token": session_token,
            "conversation_id": state.conversation_id,
            "latest_timestamp": int(time.time() * 1000),
            "ai_avatar": f"{EXTERNAL_URL}/static/avatar.png",
            "ai_name": BOT_NAME,
        },
        "messages": state.messages,
        "widget": {
            "should_show_resume_modal": state.current_step == Step.RESUME,
            "company_name": COMPANY_NAME,
            "footer_html": f'<span>Olivia by <span class="semibold"><a target="_blank" href="https://paradox.ai">Paradox</a></span></span>',
            "compsite_slug": f"{COMPANY_NAME}/Job",
            "domain": "olivia.paradox.ai",
        },
        "session_id": state.session_id,
        "success": True,
    }


@app.post("/api/widget/{widget_id}/answer")
async def post_answer(widget_id: str, request: Request):
    """Process a candidate's message/answer."""
    body = await request.json()
    message = body.get("message", "")
    conversation_id = body.get("conversation_id")
    session_id = body.get("session_id", "")

    # Find session
    state = None
    if session_id and session_id in sessions:
        state = sessions[session_id]
    elif conversation_id:
        for s in sessions.values():
            if s.conversation_id == conversation_id:
                state = s
                break

    if not state:
        job_id = body.get("job_id", "mock-job-001")
        state = _new_session(job_id=str(job_id))

    # Process the answer
    new_messages = _process_answer(state, message)

    return {
        "widget": {
            "should_show_resume_modal": state.current_step == Step.RESUME,
        },
        "messages": new_messages,
        "queued": False,
        "success": True,
    }


@app.get("/api/widget/{widget_id}/xhr")
async def xhr_poll(widget_id: str, conversation_id: int = 0):
    """XHR polling endpoint for async message delivery."""
    # Find session
    state = None
    for s in sessions.values():
        if s.conversation_id == conversation_id:
            state = s
            break

    if not state:
        return {"messages": [], "success": True}

    # Return recent messages (last 2)
    recent = state.messages[-2:] if state.messages else []
    return {
        "messages": recent,
        "success": True,
    }


@app.post("/api/widget/{widget_id}/upload-resume")
async def upload_resume(
    widget_id: str,
    file: UploadFile = File(...),
    session_id: str = Form(""),
    conversation_id: int = Form(0),
):
    """Handle resume file upload."""
    state = None
    if session_id in sessions:
        state = sessions[session_id]
    elif conversation_id:
        for s in sessions.values():
            if s.conversation_id == conversation_id:
                state = s
                break

    if state:
        content = await file.read()
        state.candidate_data["resume_uploaded"] = True
        state.candidate_data["resume_filename"] = file.filename
        state.candidate_data["resume_size"] = len(content)

        # Advance past resume step if we're on it
        if state.current_step == Step.RESUME:
            state.current_step = Step.CONFIRM
            question = _format_question(Step.CONFIRM, state)
            bot = _bot_msg(state, f"Resume received! {question}")
            state.messages.append(bot)

    return {"success": True, "message": "Resume uploaded successfully"}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Debug endpoint -- get full session state."""
    state = sessions.get(session_id)
    if not state:
        return JSONResponse(status_code=404, content={"error": "Session not found"})
    return {
        "session_id": state.session_id,
        "conversation_id": state.conversation_id,
        "current_step": state.current_step.value,
        "candidate_data": state.candidate_data,
        "message_count": len(state.messages),
        "job_id": state.job_id,
        "job_title": state.job_title,
    }


@app.get("/api/sessions")
async def list_sessions():
    """Debug endpoint -- list all sessions."""
    return [
        {
            "session_id": s.session_id,
            "current_step": s.current_step.value,
            "candidate_name": s.candidate_data.get("full_name", ""),
            "message_count": len(s.messages),
        }
        for s in sessions.values()
    ]


# ─── Chat UI Page (mimics Paradox.ai's widget) ──────────────────────────────


@app.get("/co/{company_slug}/Job", response_class=HTMLResponse)
async def job_page(company_slug: str, job_id: str = "mock-job-001", posting_type: int = 1):
    """Serve the Olivia chat widget page (mimics Paradox.ai)."""
    return CHAT_HTML.replace("{{WIDGET_ID}}", WIDGET_ID).replace(
        "{{JOB_ID}}", job_id
    ).replace(
        "{{COMPANY}}", COMPANY_NAME
    ).replace(
        "{{BOT_NAME}}", BOT_NAME
    ).replace(
        "{{BASE_URL}}", EXTERNAL_URL
    )


CHAT_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apply Now | {{COMPANY}}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; height: 100vh; display: flex; flex-direction: column; }
  .header { background: #1a1a2e; color: white; padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
  .header .avatar { width: 40px; height: 40px; border-radius: 50%; background: #e94560; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; }
  .header .info { flex: 1; }
  .header .info h2 { font-size: 16px; font-weight: 600; }
  .header .info p { font-size: 12px; opacity: 0.7; }
  .me-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .me-messages__item { display: flex; gap: 8px; max-width: 80%; }
  .me-messages__item--ours { align-self: flex-start; }
  .me-messages__item--theirs { align-self: flex-end; flex-direction: row-reverse; }
  .olivia-msg-bubble { padding: 12px 16px; border-radius: 18px; font-size: 14px; line-height: 1.5; }
  .me-messages__item--ours .olivia-msg-bubble { background: white; border: 1px solid #e0e0e0; border-bottom-left-radius: 4px; }
  .me-messages__item--theirs .olivia-msg-bubble { background: #1a1a2e; color: white; border-bottom-right-radius: 4px; }
  .olivia-date-message { align-self: center; font-size: 11px; color: #999; padding: 8px 0; }
  .composer { padding: 12px 16px; border-top: 1px solid #e0e0e0; background: white; display: flex; gap: 8px; align-items: center; }
  .composer textarea { flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 10px 16px; font-size: 14px; resize: none; outline: none; font-family: inherit; min-height: 40px; max-height: 100px; }
  .composer textarea:focus { border-color: #1a1a2e; }
  .send-message-btn { width: 40px; height: 40px; border-radius: 50%; border: none; background: #1a1a2e; color: white; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; }
  .send-message-btn:disabled { opacity: 0.3; cursor: default; }
  .send-message-btn:hover:not(:disabled) { background: #16213e; }
  .typing { align-self: flex-start; padding: 8px 16px; }
  .typing .dots { display: inline-flex; gap: 4px; }
  .typing .dots span { width: 8px; height: 8px; background: #ccc; border-radius: 50%; animation: bounce 1.4s infinite; }
  .typing .dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing .dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
</style>
</head>
<body>

<div class="header">
  <div class="avatar">{{BOT_NAME}}</div>
  <div class="info">
    <h2>{{BOT_NAME}}</h2>
    <p>AI Job Assistant at {{COMPANY}}</p>
  </div>
</div>

<div class="me-messages" id="messages">
  <div class="me-messages__item olivia-date-message">Conversation Started</div>
</div>

<div class="composer">
  <textarea id="widget_composer_input" placeholder="Write a reply..." rows="1" role="textbox"></textarea>
  <button class="send-message-btn" id="sendBtn" disabled aria-label="Send message">➤</button>
</div>

<input type="file" id="fileUpload" style="display:none" accept=".pdf,.doc,.docx,.txt">

<script>
const WIDGET_ID = "{{WIDGET_ID}}";
const JOB_ID = "{{JOB_ID}}";
const BASE_URL = "{{BASE_URL}}";
let sessionId = "";
let conversationId = 0;
let latestMsgId = 0;

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("widget_composer_input");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileUpload");

function addMessage(text, type) {
  const item = document.createElement("div");
  item.className = "me-messages__item me-messages__item--" + type;
  const bubble = document.createElement("div");
  bubble.className = "olivia-msg-bubble";
  bubble.textContent = text;
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = (type === "ours" ? "{{BOT_NAME}} said," : "You said,") + " " + text;
  bubble.appendChild(sr);
  item.appendChild(bubble);
  messagesEl.appendChild(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping() {
  const el = document.createElement("div");
  el.className = "typing";
  el.id = "typing";
  el.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

async function initWidget() {
  const res = await fetch(BASE_URL + "/api/widget/" + WIDGET_ID + "?source=2&job_id=" + JOB_ID);
  const data = await res.json();
  sessionId = data.session_id || "";
  conversationId = data.candidate?.conversation_id || 0;
  for (const msg of (data.messages || [])) {
    addMessage(msg.text, msg.type);
    latestMsgId = Math.max(latestMsgId, parseInt(msg.org_id) || 0);
  }
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  addMessage(text, "theirs");
  inputEl.value = "";
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch(BASE_URL + "/api/widget/" + WIDGET_ID + "/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        conversation_id: conversationId,
        session_id: sessionId,
        job_id: JOB_ID,
      }),
    });
    const data = await res.json();
    hideTyping();
    for (const msg of (data.messages || [])) {
      if (msg.type === "ours") {
        addMessage(msg.text, "ours");
      }
    }
    if (data.widget?.should_show_resume_modal) {
      fileInput.click();
    }
  } catch (e) {
    hideTyping();
    addMessage("Sorry, something went wrong. Please try again.", "ours");
  }
}

inputEl.addEventListener("input", () => { sendBtn.disabled = !inputEl.value.trim(); });
inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
sendBtn.addEventListener("click", sendMessage);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  addMessage("Uploading resume: " + file.name, "theirs");
  showTyping();
  const fd = new FormData();
  fd.append("file", file);
  fd.append("session_id", sessionId);
  fd.append("conversation_id", conversationId.toString());
  try {
    await fetch(BASE_URL + "/api/widget/" + WIDGET_ID + "/upload-resume", { method: "POST", body: fd });
    hideTyping();
    // Re-fetch latest messages
    const res = await fetch(BASE_URL + "/api/widget/" + WIDGET_ID + "/xhr?conversation_id=" + conversationId);
    const data = await res.json();
    for (const msg of (data.messages || [])) {
      if (msg.type === "ours" && parseInt(msg.org_id) > latestMsgId) {
        addMessage(msg.text, "ours");
        latestMsgId = parseInt(msg.org_id);
      }
    }
  } catch (e) {
    hideTyping();
    addMessage("Failed to upload resume. Please try again.", "ours");
  }
});

initWidget();
</script>
</body>
</html>
"""
