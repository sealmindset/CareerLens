"""Profile endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_profile_get_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/profile")
    assert resp.status_code == 401


async def test_profile_get_admin(admin_client: AsyncClient):
    """Super Admin can get their profile (auto-created if missing)."""
    resp = await admin_client.get("/api/profile")
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert "skills" in data
    assert "experiences" in data
    assert "educations" in data


async def test_profile_update(admin_client: AsyncClient):
    """Update profile headline and summary."""
    resp = await admin_client.put(
        "/api/profile",
        json={"headline": "Test Headline", "summary": "Test summary text"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["headline"] == "Test Headline"
    assert data["summary"] == "Test summary text"


async def test_profile_skills_crud(admin_client: AsyncClient):
    """Add and list skills."""
    # Add a skill
    resp = await admin_client.post(
        "/api/profile/skills",
        json={
            "skill_name": "Python",
            "proficiency_level": "expert",
            "years_experience": 10,
        },
    )
    assert resp.status_code in (200, 201)
    skill = resp.json()
    assert skill["skill_name"] == "Python"

    # List skills via profile
    resp = await admin_client.get("/api/profile")
    assert resp.status_code == 200
    skills = resp.json()["skills"]
    assert any(s["skill_name"] == "Python" for s in skills)


async def test_profile_user_access(user_client: AsyncClient):
    """Regular User can access their own profile."""
    resp = await user_client.get("/api/profile")
    assert resp.status_code == 200
