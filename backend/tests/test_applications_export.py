"""Application CSV export endpoint tests."""

import csv
import io

import pytest
from httpx import AsyncClient


async def test_export_unauthenticated(client: AsyncClient):
    """GET /api/applications/export without auth returns 401."""
    resp = await client.get("/api/applications/export?format=csv")
    assert resp.status_code == 401


async def test_export_csv_admin(admin_client: AsyncClient):
    """Admin can export applications as CSV."""
    resp = await admin_client.get("/api/applications/export?format=csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers.get("content-disposition", "")

    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    # At least header row
    assert len(rows) >= 1
    header = rows[0]
    assert "Job Title" in header
    assert "Company" in header
    assert "Status" in header
    assert "Submitted At" in header
    assert "Notes" in header


async def test_export_csv_has_data_columns(admin_client: AsyncClient):
    """CSV data rows have the same number of columns as the header."""
    resp = await admin_client.get("/api/applications/export?format=csv")
    assert resp.status_code == 200
    reader = csv.reader(io.StringIO(resp.text))
    rows = list(reader)
    if len(rows) > 1:
        header_len = len(rows[0])
        for row in rows[1:]:
            assert len(row) == header_len


async def test_export_invalid_format(admin_client: AsyncClient):
    """Invalid format parameter returns 422."""
    resp = await admin_client.get("/api/applications/export?format=xlsx")
    assert resp.status_code == 422


async def test_export_user_no_permission(user_client: AsyncClient):
    """Regular user without applications.view permission gets 403."""
    resp = await user_client.get("/api/applications/export?format=csv")
    assert resp.status_code == 403
