"""Shared test fixtures for CareerLens backend.

Strategy:
- Creates a fresh async engine per test to avoid event loop conflicts
- Uses the live Docker postgres (db:5432) with seed data
- Overrides get_current_user for auth, get_db for database
"""

import os
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.middleware.auth import get_current_user
from app.schemas.auth import UserInfo
from app.main import app

# ---------------------------------------------------------------------------
# Database URL
# ---------------------------------------------------------------------------

_db_host = os.environ.get("TEST_DB_HOST", "db")
_db_port = os.environ.get("TEST_DB_PORT", "5432")
TEST_DATABASE_URL = (
    f"postgresql+asyncpg://career-lens:career-lens@{_db_host}:{_db_port}/career-lens"
)


# ---------------------------------------------------------------------------
# Auth user objects matching seed data
# ---------------------------------------------------------------------------

_SUPER_ADMIN_PERMISSIONS = [
    "dashboard.view",
    "profile.view", "profile.edit",
    "jobs.view", "jobs.create", "jobs.edit", "jobs.delete",
    "applications.view", "applications.create", "applications.edit", "applications.delete",
    "agents.view", "agents.create",
    "users.view", "users.edit",
    "roles.view", "roles.edit",
    "prompts.view", "prompts.edit",
    "workspaces.view", "workspaces.create", "workspaces.edit", "workspaces.delete",
    "app_settings.view", "app_settings.edit",
    "resumes.view", "resumes.create", "resumes.edit", "resumes.delete",
    "stories.view", "stories.create", "stories.edit", "stories.delete",
]

_USER_PERMISSIONS = [
    "dashboard.view",
    "profile.view", "profile.edit",
    "jobs.view",
    "agents.view",
]

SUPERADMIN_USER = UserInfo(
    sub="mock-admin",
    email="admin@career-lens.local",
    name="Admin User",
    role_id=str(uuid.uuid4()),
    role_name="Super Admin",
    permissions=_SUPER_ADMIN_PERMISSIONS,
)

REGULAR_USER = UserInfo(
    sub="mock-user",
    email="user@career-lens.local",
    name="Regular User",
    role_id=str(uuid.uuid4()),
    role_name="User",
    permissions=_USER_PERMISSIONS,
)


# ---------------------------------------------------------------------------
# Helper: build a client with optional auth override
# ---------------------------------------------------------------------------


async def _make_client(auth_user: UserInfo | None):
    """Create an AsyncClient with a fresh DB engine and optional auth override."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    if auth_user is not None:
        async def _override_auth():
            return auth_user
        app.dependency_overrides[get_current_user] = _override_auth
    else:
        app.dependency_overrides.pop(get_current_user, None)

    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    return client, engine


# ---------------------------------------------------------------------------
# Client fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def client():
    """Unauthenticated AsyncClient."""
    ac, engine = await _make_client(None)
    async with ac:
        yield ac
    await engine.dispose()
    app.dependency_overrides.clear()


@pytest.fixture
async def admin_client():
    """AsyncClient authenticated as Super Admin."""
    ac, engine = await _make_client(SUPERADMIN_USER)
    async with ac:
        yield ac
    await engine.dispose()
    app.dependency_overrides.clear()


@pytest.fixture
async def user_client():
    """AsyncClient authenticated as regular User."""
    ac, engine = await _make_client(REGULAR_USER)
    async with ac:
        yield ac
    await engine.dispose()
    app.dependency_overrides.clear()
