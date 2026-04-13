"""Analytics trends endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_trends_unauthenticated(client: AsyncClient):
    """GET /api/analytics/trends without auth returns 401."""
    resp = await client.get("/api/analytics/trends")
    assert resp.status_code == 401


async def test_trends_admin(admin_client: AsyncClient):
    """Admin can fetch analytics trends with correct response shape."""
    resp = await admin_client.get("/api/analytics/trends")
    assert resp.status_code == 200
    data = resp.json()

    assert "status_funnel" in data
    assert "weekly_activity" in data
    assert "top_companies" in data
    assert "match_distribution" in data
    assert "total_applications" in data
    assert "total_jobs" in data
    assert "interview_rate" in data
    assert "offer_rate" in data

    assert isinstance(data["status_funnel"], list)
    assert isinstance(data["weekly_activity"], list)
    assert isinstance(data["top_companies"], list)
    assert isinstance(data["match_distribution"], list)
    assert isinstance(data["total_applications"], int)
    assert isinstance(data["total_jobs"], int)


async def test_trends_status_funnel_shape(admin_client: AsyncClient):
    """Status funnel includes all expected statuses."""
    resp = await admin_client.get("/api/analytics/trends")
    data = resp.json()
    statuses = {s["status"] for s in data["status_funnel"]}
    assert "draft" in statuses
    assert "submitted" in statuses
    assert "interviewing" in statuses
    assert "offer" in statuses
    assert "rejected" in statuses


async def test_trends_match_distribution_buckets(admin_client: AsyncClient):
    """Match distribution has 4 buckets."""
    resp = await admin_client.get("/api/analytics/trends")
    data = resp.json()
    assert len(data["match_distribution"]) == 4
    ranges = [b["range"] for b in data["match_distribution"]]
    assert "0-25" in ranges
    assert "76-100" in ranges


async def test_trends_rates_are_percentages(admin_client: AsyncClient):
    """Interview and offer rates are non-negative numbers."""
    resp = await admin_client.get("/api/analytics/trends")
    data = resp.json()
    assert data["interview_rate"] >= 0
    assert data["offer_rate"] >= 0
