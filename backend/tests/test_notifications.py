"""Notification endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_notifications_unauthenticated(client: AsyncClient):
    """GET /api/notifications without auth returns 401."""
    resp = await client.get("/api/notifications")
    assert resp.status_code == 401


async def test_notifications_count_unauthenticated(client: AsyncClient):
    """GET /api/notifications/count without auth returns 401."""
    resp = await client.get("/api/notifications/count")
    assert resp.status_code == 401


async def test_notifications_list_admin(admin_client: AsyncClient):
    """Admin can list notifications with correct response shape."""
    resp = await admin_client.get("/api/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert "notifications" in data
    assert "unread_count" in data
    assert "total" in data
    assert isinstance(data["notifications"], list)
    assert isinstance(data["unread_count"], int)
    assert isinstance(data["total"], int)


async def test_notifications_count_admin(admin_client: AsyncClient):
    """Admin can get unread count."""
    resp = await admin_client.get("/api/notifications/count")
    assert resp.status_code == 200
    data = resp.json()
    assert "unread_count" in data
    assert isinstance(data["unread_count"], int)


async def test_notifications_list_user(user_client: AsyncClient):
    """Regular user can list their own notifications."""
    resp = await user_client.get("/api/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert "notifications" in data
    assert "unread_count" in data


async def test_notifications_mark_all_read(admin_client: AsyncClient):
    """Admin can mark all notifications as read."""
    resp = await admin_client.patch(
        "/api/notifications",
        json={"mark_all_read": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "updated" in data
    assert isinstance(data["updated"], int)

    # Verify count is now 0
    count_resp = await admin_client.get("/api/notifications/count")
    assert count_resp.json()["unread_count"] == 0


async def test_notifications_item_shape(admin_client: AsyncClient):
    """Each notification in the list has required fields."""
    resp = await admin_client.get("/api/notifications?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    if data["notifications"]:
        item = data["notifications"][0]
        assert "id" in item
        assert "notification_type" in item
        assert "title" in item
        assert "sent_at" in item
        assert "status" in item
        assert "read_at" in item


async def test_notifications_pagination(admin_client: AsyncClient):
    """Pagination params are respected."""
    resp = await admin_client.get("/api/notifications?limit=2&offset=0")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["notifications"]) <= 2
