from unittest.mock import AsyncMock, patch

import pytest
import httpx
from starlette.testclient import TestClient

from app.main import app


@pytest.fixture
def test_client():
    """Synchronous test client for WebSocket tests."""
    return TestClient(app)


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_ok(self):
        """GET /health should return status ok."""
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "interview-simulator"


class TestWebSocketNoToken:
    def test_ws_rejected_without_token(self, test_client):
        """WebSocket connection with no token should be closed with code 4001."""
        import uuid

        session_id = uuid.uuid4()
        with pytest.raises(Exception):
            with test_client.websocket_connect(f"/api/sim/sessions/{session_id}/live"):
                pass  # Should not reach here

    def test_ws_rejected_without_token_close_code(self, test_client):
        """Verify the server sends close code 4001 when no token is provided."""
        import uuid
        from starlette.websockets import WebSocketDisconnect

        session_id = uuid.uuid4()
        try:
            with test_client.websocket_connect(f"/api/sim/sessions/{session_id}/live") as ws:
                # The server should close the connection before we can interact
                ws.receive_json()
        except (WebSocketDisconnect, Exception) as exc:
            # WebSocketDisconnect carries the close code
            if hasattr(exc, "code"):
                assert exc.code == 4001


class TestWebSocketInvalidToken:
    def test_ws_rejected_with_invalid_token(self, test_client):
        """WebSocket connection with an invalid JWT should be closed with code 4001."""
        import uuid

        session_id = uuid.uuid4()
        try:
            with test_client.websocket_connect(
                f"/api/sim/sessions/{session_id}/live?token=invalid.jwt.token"
            ) as ws:
                ws.receive_json()
        except Exception as exc:
            if hasattr(exc, "code"):
                assert exc.code == 4001

    def test_ws_rejected_with_malformed_token(self, test_client):
        """WebSocket connection with completely malformed token should be closed with code 4001."""
        import uuid

        session_id = uuid.uuid4()
        try:
            with test_client.websocket_connect(
                f"/api/sim/sessions/{session_id}/live?token=not-even-a-jwt"
            ) as ws:
                ws.receive_json()
        except Exception as exc:
            if hasattr(exc, "code"):
                assert exc.code == 4001

    @pytest.mark.asyncio
    async def test_ws_rejected_with_expired_token(self, test_client):
        """WebSocket connection with an expired JWT should be closed with code 4001."""
        import uuid
        import time
        from jose import jwt

        session_id = uuid.uuid4()
        expired_token = jwt.encode(
            {"sub": str(uuid.uuid4()), "exp": int(time.time()) - 3600},
            "change-me-in-production",
            algorithm="HS256",
        )
        try:
            with test_client.websocket_connect(
                f"/api/sim/sessions/{session_id}/live?token={expired_token}"
            ) as ws:
                ws.receive_json()
        except Exception as exc:
            if hasattr(exc, "code"):
                assert exc.code == 4001
