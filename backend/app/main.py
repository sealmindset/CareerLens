import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, permissions, roles, users, prompts
from app.routers import profile, jobs, applications, agents, dashboard
from app.routers import resume_variants, story_bank, notifications
from app.routers import analytics, security_scan, ai_safety
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_follow_up_loop())
    yield
    task.cancel()


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
app.include_router(story_bank.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
app.include_router(security_scan.router)
app.include_router(ai_safety.router)
app.include_router(settings_router.router)
