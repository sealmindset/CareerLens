"""Dashboard endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_dashboard_unauthenticated(client: AsyncClient):
    """Dashboard requires auth."""
    resp = await client.get("/api/dashboard")
    assert resp.status_code == 401


async def test_dashboard_admin(admin_client: AsyncClient):
    """Super Admin can access dashboard and gets expected shape."""
    resp = await admin_client.get("/api/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_jobs" in data
    assert "active_applications" in data
    assert "interviews" in data
    assert "offers" in data
    assert "match_rate" in data
    assert "profile_completeness" in data
    assert "skills_count" in data
    assert "recent_activity" in data


async def test_dashboard_user(user_client: AsyncClient):
    """Regular User can access dashboard (has dashboard.view)."""
    resp = await user_client.get("/api/dashboard")
    assert resp.status_code == 200
