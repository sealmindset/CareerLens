"""Applications endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_applications_list_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/applications")
    assert resp.status_code == 401


async def test_applications_list_admin(admin_client: AsyncClient):
    """Super Admin can list applications."""
    resp = await admin_client.get("/api/applications")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_application_lifecycle(admin_client: AsyncClient):
    """Create a job, create an application for it, update status."""
    # Create a job first
    job_resp = await admin_client.post(
        "/api/jobs",
        json={
            "title": "QA Engineer",
            "company": "QACorp",
            "url": "https://example.com/qa",
            "job_type": "full_time",
            "source": "manual",
        },
    )
    assert job_resp.status_code in (200, 201)
    job_id = job_resp.json()["id"]

    # Create application
    app_resp = await admin_client.post(
        "/api/applications",
        json={"job_listing_id": job_id},
    )
    assert app_resp.status_code in (200, 201)
    app_data = app_resp.json()
    assert app_data["job_listing_id"] == job_id
    assert app_data["status"] in ("draft", "saved")
    app_id = app_data["id"]

    # Update status
    update_resp = await admin_client.put(
        f"/api/applications/{app_id}",
        json={"status": "submitted"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "submitted"
