from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, permissions, roles, users
from app.routers import profile, jobs, applications, agents, dashboard
from app.routers import settings as settings_router

app = FastAPI(title="career-lens", version="0.1.0")

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

# Domain routers
app.include_router(profile.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(agents.router)
app.include_router(dashboard.router)
app.include_router(settings_router.router)
