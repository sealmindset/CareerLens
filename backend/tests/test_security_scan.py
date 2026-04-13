"""Security scan endpoint tests."""

import pytest
from httpx import AsyncClient


async def test_scan_unauthenticated(client: AsyncClient):
    """GET /api/admin/security/scan without auth returns 401."""
    resp = await client.get("/api/admin/security/scan")
    assert resp.status_code == 401


async def test_scan_admin(admin_client: AsyncClient):
    """Admin can run security scan with correct response shape."""
    resp = await admin_client.get("/api/admin/security/scan")
    assert resp.status_code == 200
    data = resp.json()

    assert "findings" in data
    assert "total_checks" in data
    assert "passed" in data
    assert "failed" in data
    assert "score" in data
    assert isinstance(data["findings"], list)
    assert data["total_checks"] > 0
    assert data["passed"] + data["failed"] == data["total_checks"]
    assert 0 <= data["score"] <= 100


async def test_scan_finding_shape(admin_client: AsyncClient):
    """Each finding has required fields."""
    resp = await admin_client.get("/api/admin/security/scan")
    data = resp.json()
    for finding in data["findings"]:
        assert "id" in finding
        assert "category" in finding
        assert "severity" in finding
        assert "title" in finding
        assert "description" in finding
        assert "passed" in finding
        assert finding["severity"] in ("critical", "high", "medium", "low", "info")


async def test_scan_checks_oidc(admin_client: AsyncClient):
    """Scan detects mock OIDC provider in dev environment."""
    resp = await admin_client.get("/api/admin/security/scan")
    data = resp.json()
    oidc_finding = next((f for f in data["findings"] if f["id"] == "SEC-004"), None)
    assert oidc_finding is not None
    # In test env, OIDC issuer points to mock-oidc
    assert not oidc_finding["passed"]


async def test_scan_no_permission(user_client: AsyncClient):
    """Regular user without app_settings.view gets 403."""
    resp = await user_client.get("/api/admin/security/scan")
    assert resp.status_code == 403
