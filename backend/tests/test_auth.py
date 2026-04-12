"""Auth endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_me_unauthenticated(client: AsyncClient):
    """GET /api/auth/me without auth returns 401."""
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_me_admin(admin_client: AsyncClient):
    """GET /api/auth/me with Super Admin returns user info."""
    resp = await admin_client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@career-lens.local"
    assert data["role_name"] == "Super Admin"
    assert "dashboard.view" in data["permissions"]


async def test_me_user(user_client: AsyncClient):
    """GET /api/auth/me with User returns limited permissions."""
    resp = await user_client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["role_name"] == "User"
    assert "users.view" not in data["permissions"]


async def test_logout(admin_client: AsyncClient):
    """POST /api/auth/logout returns success message."""
    resp = await admin_client.post("/api/auth/logout")
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Logged out successfully"
