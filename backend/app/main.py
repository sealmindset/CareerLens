import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, permissions, roles, users, prompts
from app.routers import profile, jobs, applications, agents, dashboard
from app.routers import resume_variants, story_bank, notifications, events, resume_chat
from app.routers import analytics, security_scan, ai_safety
from app.routers import tasks, quick_captures, interview_questions
from app.routers import settings as settings_router

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Follow-up reminder background loop (runs daily at ~08:00 UTC)
# ---------------------------------------------------------------------------

async def _follow_up_loop():
    """Run follow-up reminder check every 24 hours."""
    from app.database import async_session
    from app.services.follow_up_scheduler import check_follow_ups

    # Wait 60s on startup so the DB is ready
    await asyncio.sleep(60)
    while True:
        try:
            async with async_session() as db:
                created = await check_follow_ups(db)
                if created:
                    logger.info("Follow-up scheduler: %d reminders sent", created)
        except Exception:
            logger.exception("Follow-up scheduler error")
        # Sleep 24 hours
        await asyncio.sleep(86400)


async def _event_reminder_loop():
    """Run event reminder check every hour."""
    from app.database import async_session
    from app.services.event_reminder import check_upcoming_events

    # Wait 60s on startup so the DB is ready
    await asyncio.sleep(60)
    while True:
        try:
            async with async_session() as db:
                created = await check_upcoming_events(db)
                if created:
                    logger.info("Event reminder: %d reminders sent", created)
        except Exception:
            logger.exception("Event reminder error")
        # Sleep 1 hour
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    follow_up_task = asyncio.create_task(_follow_up_loop())
    event_reminder_task = asyncio.create_task(_event_reminder_loop())
    yield
    follow_up_task.cancel()
    event_reminder_task.cancel()


app = FastAPI(title="career-lens", version="0.1.0", lifespan=lifespan)

# CORS -- allow frontend origin with credentials (cookies)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoints
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}


# Core routers (auth, RBAC)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(roles.router)
app.include_router(permissions.router)
app.include_router(prompts.router)

# Domain routers
app.include_router(profile.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(agents.router)
app.include_router(dashboard.router)
app.include_router(resume_variants.router)
app.include_router(resume_chat.router)
app.include_router(story_bank.router)
app.include_router(notifications.router)
app.include_router(events.router)
app.include_router(tasks.router)
app.include_router(quick_captures.router)
app.include_router(interview_questions.router)
app.include_router(analytics.router)
app.include_router(security_scan.router)
app.include_router(ai_safety.router)
app.include_router(settings_router.router)
