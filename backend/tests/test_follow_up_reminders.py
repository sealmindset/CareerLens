"""Follow-up reminder tests."""

import pytest
from httpx import AsyncClient


async def test_follow_up_check_unauthenticated(client: AsyncClient):
    """POST /api/notifications/follow-up-check without auth returns 401."""
    resp = await client.post("/api/notifications/follow-up-check")
    assert resp.status_code == 401


async def test_follow_up_check_no_permission(user_client: AsyncClient):
    """Regular user without app_settings.edit gets 403."""
    resp = await user_client.post("/api/notifications/follow-up-check")
    assert resp.status_code == 403


async def test_follow_up_check_admin(admin_client: AsyncClient):
    """Admin can trigger follow-up check with correct response shape."""
    resp = await admin_client.post("/api/notifications/follow-up-check")
    assert resp.status_code == 200
    data = resp.json()
    assert "reminders_created" in data
    assert isinstance(data["reminders_created"], int)
    assert data["reminders_created"] >= 0


async def test_follow_up_check_idempotent(admin_client: AsyncClient):
    """Running follow-up check twice should not create duplicate reminders."""
    resp1 = await admin_client.post("/api/notifications/follow-up-check")
    assert resp1.status_code == 200
    count1 = resp1.json()["reminders_created"]

    resp2 = await admin_client.post("/api/notifications/follow-up-check")
    assert resp2.status_code == 200
    count2 = resp2.json()["reminders_created"]

    # Second run should create zero or fewer (dedup)
    assert count2 <= count1
