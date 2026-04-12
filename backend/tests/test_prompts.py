"""AI Instructions (prompts) admin endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_prompts_list_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/admin/prompts")
    assert resp.status_code == 401


async def test_prompts_list_admin(admin_client: AsyncClient):
    """Super Admin can list all managed prompts."""
    resp = await admin_client.get("/api/admin/prompts")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0  # seeded prompts should exist
    # Check shape
    first = data[0]
    assert "id" in first
    assert "slug" in first
    assert "name" in first
    assert "agent_name" in first
    assert "model_tier" in first
    assert "status" in first


async def test_prompts_detail(admin_client: AsyncClient):
    """Get a specific prompt with version history."""
    # List first to get an ID
    list_resp = await admin_client.get("/api/admin/prompts")
    prompt_id = list_resp.json()[0]["id"]

    resp = await admin_client.get(f"/api/admin/prompts/{prompt_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == prompt_id
    assert "versions" in data
    assert "content" in data


async def test_prompts_filter_by_agent(admin_client: AsyncClient):
    """Filter prompts by agent_name."""
    resp = await admin_client.get("/api/admin/prompts?agent_name=scout")
    assert resp.status_code == 200
    data = resp.json()
    for p in data:
        assert p["agent_name"] == "scout"


async def test_prompts_user_forbidden(user_client: AsyncClient):
    """Regular User does NOT have prompts.view — should get 403."""
    resp = await user_client.get("/api/admin/prompts")
    assert resp.status_code == 403


async def test_prompts_test_action(admin_client: AsyncClient):
    """Run safety tests on a prompt."""
    list_resp = await admin_client.get("/api/admin/prompts")
    prompt_id = list_resp.json()[0]["id"]

    resp = await admin_client.put(
        f"/api/admin/prompts/{prompt_id}",
        json={"action": "test"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "passed" in data
    assert "adversarial_tests" in data
