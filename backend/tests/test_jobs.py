"""Jobs endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_jobs_list_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/jobs")
    assert resp.status_code == 401


async def test_jobs_list_admin(admin_client: AsyncClient):
    """Super Admin can list jobs."""
    resp = await admin_client.get("/api/jobs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_jobs_create(admin_client: AsyncClient):
    """Create a job listing."""
    resp = await admin_client.post(
        "/api/jobs",
        json={
            "title": "Senior Engineer",
            "company": "TestCorp",
            "url": "https://example.com/job/123",
            "description": "A test job listing",
            "location": "Remote",
            "job_type": "full_time",
            "source": "manual",
        },
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["title"] == "Senior Engineer"
    assert data["company"] == "TestCorp"
    return data["id"]


async def test_jobs_get_by_id(admin_client: AsyncClient):
    """Create then fetch a job by ID."""
    # Create
    create_resp = await admin_client.post(
        "/api/jobs",
        json={
            "title": "Backend Dev",
            "company": "AcmeInc",
            "url": "https://example.com/job/456",
            "job_type": "full_time",
            "source": "manual",
        },
    )
    assert create_resp.status_code in (200, 201)
    job_id = create_resp.json()["id"]

    # Fetch
    resp = await admin_client.get(f"/api/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id


async def test_jobs_user_can_view(user_client: AsyncClient):
    """Regular User has jobs.view permission."""
    resp = await user_client.get("/api/jobs")
    assert resp.status_code == 200


async def test_jobs_user_cannot_create(user_client: AsyncClient):
    """Regular User does NOT have jobs.create — should get 403."""
    resp = await user_client.post(
        "/api/jobs",
        json={
            "title": "Blocked Job",
            "company": "NoCo",
            "url": "https://example.com/blocked",
            "job_type": "full_time",
            "source": "manual",
        },
    )
    assert resp.status_code == 403
