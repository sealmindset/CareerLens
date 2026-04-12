"""Permission boundary tests -- verify RBAC enforcement across endpoints."""

import pytest
from httpx import AsyncClient


# Endpoints that require elevated permissions (Admin/Super Admin only)
_ADMIN_ONLY = [
    ("GET", "/api/users"),
    ("GET", "/api/roles"),
    ("GET", "/api/admin/prompts"),
    ("GET", "/api/admin/settings"),
]

# Endpoints accessible to regular Users
_USER_ACCESSIBLE = [
    ("GET", "/api/dashboard"),
    ("GET", "/api/profile"),
    ("GET", "/api/jobs"),
    ("GET", "/api/agents/conversations"),
]


@pytest.mark.parametrize("method,path", _ADMIN_ONLY)
async def test_admin_endpoints_forbidden_for_user(
    user_client: AsyncClient, method: str, path: str
):
    """Regular User should get 403 on admin-only endpoints."""
    resp = await user_client.request(method, path)
    assert resp.status_code == 403, f"{method} {path} returned {resp.status_code}"


@pytest.mark.parametrize("method,path", _USER_ACCESSIBLE)
async def test_user_accessible_endpoints(
    user_client: AsyncClient, method: str, path: str
):
    """Regular User should be able to access these endpoints."""
    resp = await user_client.request(method, path)
    assert resp.status_code == 200, f"{method} {path} returned {resp.status_code}"


@pytest.mark.parametrize("method,path", _ADMIN_ONLY + _USER_ACCESSIBLE)
async def test_all_endpoints_reject_unauthenticated(
    client: AsyncClient, method: str, path: str
):
    """No endpoint should return 200 without authentication."""
    resp = await client.request(method, path)
    assert resp.status_code == 401, f"{method} {path} returned {resp.status_code}"
