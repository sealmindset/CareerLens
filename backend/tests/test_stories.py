"""Story Bank endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_stories_list_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/stories")
    assert resp.status_code == 401


async def test_stories_list_admin(admin_client: AsyncClient):
    """Super Admin can list stories."""
    resp = await admin_client.get("/api/stories")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


async def test_stories_summary(admin_client: AsyncClient):
    """Get story bank summary stats."""
    resp = await admin_client.get("/api/stories/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_count" in data
    assert "active_count" in data
    assert "archived_count" in data
    assert "unique_companies" in data


async def test_stories_create(admin_client: AsyncClient):
    """Create a story manually."""
    resp = await admin_client.post(
        "/api/stories",
        json={
            "source_bullet": "Led migration to cloud platform",
            "source_company": "TestCorp",
            "source_title": "Senior Engineer",
            "story_title": "Cloud Migration",
            "problem": "Legacy on-prem infrastructure was slow.",
            "solved": "Designed and led migration to AWS.",
            "deployed": "Reduced infra costs by 40%.",
            "takeaway": "Cloud-native architecture pays off.",
            "hook_line": "I cut our infra costs by 40%",
            "trigger_keywords": ["cloud", "migration", "AWS"],
            "proof_metric": "40% cost reduction",
        },
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["story_title"] == "Cloud Migration"
    assert data["status"] == "active"


async def test_stories_user_forbidden(user_client: AsyncClient):
    """Regular User does NOT have stories.view — should get 403."""
    resp = await user_client.get("/api/stories")
    assert resp.status_code == 403
