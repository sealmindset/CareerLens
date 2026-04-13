"""Job discovery endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_discover_unauthenticated(client: AsyncClient):
    """POST /api/jobs/discover without auth returns 401."""
    resp = await client.post("/api/jobs/discover", json={"query": "engineer"})
    assert resp.status_code == 401


async def test_discover_admin(admin_client: AsyncClient):
    """Admin can call discover and get correct response shape."""
    resp = await admin_client.post(
        "/api/jobs/discover",
        json={"query": "senior software engineer", "location": "Remote"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert "search_links" in data
    assert isinstance(data["suggestions"], list)
    assert isinstance(data["search_links"], list)
    assert len(data["suggestions"]) >= 1
    assert len(data["search_links"]) >= 1


async def test_discover_suggestion_shape(admin_client: AsyncClient):
    """Each suggestion has title, keywords, and rationale."""
    resp = await admin_client.post(
        "/api/jobs/discover",
        json={"query": "data scientist"},
    )
    data = resp.json()
    if data["suggestions"]:
        s = data["suggestions"][0]
        assert "title" in s
        assert "keywords" in s
        assert "rationale" in s


async def test_discover_board_links(admin_client: AsyncClient):
    """Board links include expected job boards."""
    resp = await admin_client.post(
        "/api/jobs/discover",
        json={"query": "python developer", "location": "New York"},
    )
    data = resp.json()
    boards = {link["board"] for link in data["search_links"]}
    assert "LinkedIn" in boards
    assert "Indeed" in boards


async def test_discover_empty_query(admin_client: AsyncClient):
    """Empty query still returns results (uses profile or fallback)."""
    resp = await admin_client.post(
        "/api/jobs/discover",
        json={"query": "", "location": ""},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["suggestions"]) >= 1


async def test_discover_no_permission(user_client: AsyncClient):
    """Regular user without jobs.create permission gets 403."""
    resp = await user_client.post(
        "/api/jobs/discover",
        json={"query": "engineer"},
    )
    assert resp.status_code == 403
