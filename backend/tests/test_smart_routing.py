"""Smart routing provider tests -- MLX local inference routing."""

import pytest

from app.ai.provider import AIProvider, SmartRoutingProvider


class MockProvider(AIProvider):
    """Test provider that records calls and optionally fails."""

    def __init__(self, name: str, fail: bool = False):
        self.name = name
        self.fail = fail
        self.called = False
        self.last_model = None

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        self.called = True
        self.last_model = model
        if self.fail:
            raise RuntimeError(f"{self.name} failed")
        return f"{self.name}:ok"

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        self.called = True
        self.last_model = model
        if self.fail:
            raise RuntimeError(f"{self.name} stream failed")
        yield f"{self.name}:chunk"


def _make_router(cloud: AIProvider, local: AIProvider) -> SmartRoutingProvider:
    """Create a SmartRoutingProvider with a manually-set routing table."""
    router = SmartRoutingProvider.__new__(SmartRoutingProvider)
    router._cloud = cloud
    router._local = local
    router._mlx_healthy = True
    router._last_health_check = 0.0
    router._heavy_models = {"claude-opus-4-6"}
    router._cloud_to_local = {
        "claude-sonnet-4-5": "Qwen2.5-72B-Instruct-4bit",
        "claude-haiku-4-5": "Qwen2.5-7B-Instruct-4bit",
    }
    return router


@pytest.mark.asyncio
async def test_heavy_model_routes_to_cloud():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)

    result = await router.complete("sys", "user", model="claude-opus-4-6")
    assert result == "cloud:ok"
    assert cloud.called
    assert not local.called
    assert cloud.last_model == "claude-opus-4-6"


@pytest.mark.asyncio
async def test_standard_model_routes_to_mlx():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)

    result = await router.complete("sys", "user", model="claude-sonnet-4-5")
    assert result == "local:ok"
    assert local.called
    assert not cloud.called
    assert local.last_model == "Qwen2.5-72B-Instruct-4bit"


@pytest.mark.asyncio
async def test_light_model_routes_to_mlx():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)

    result = await router.complete("sys", "user", model="claude-haiku-4-5")
    assert result == "local:ok"
    assert local.called
    assert local.last_model == "Qwen2.5-7B-Instruct-4bit"


@pytest.mark.asyncio
async def test_unknown_model_routes_to_cloud():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)

    result = await router.complete("sys", "user", model="gpt-unknown")
    assert result == "cloud:ok"
    assert cloud.called
    assert not local.called


@pytest.mark.asyncio
async def test_none_model_routes_to_cloud():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)

    result = await router.complete("sys", "user", model=None)
    assert result == "cloud:ok"
    assert cloud.called
    assert not local.called


@pytest.mark.asyncio
async def test_mlx_failure_falls_back_to_cloud():
    cloud = MockProvider("cloud")
    local = MockProvider("local", fail=True)
    router = _make_router(cloud, local)

    result = await router.complete("sys", "user", model="claude-sonnet-4-5")
    assert result == "cloud:ok"
    assert local.called
    assert cloud.called
    assert cloud.last_model == "claude-sonnet-4-5"


@pytest.mark.asyncio
async def test_mlx_failure_marks_unhealthy():
    cloud = MockProvider("cloud")
    local = MockProvider("local", fail=True)
    router = _make_router(cloud, local)

    await router.complete("sys", "user", model="claude-sonnet-4-5")
    assert not router._mlx_healthy


@pytest.mark.asyncio
async def test_unhealthy_mlx_skips_to_cloud():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)
    router._mlx_healthy = False
    router._last_health_check = float("inf")

    result = await router.complete("sys", "user", model="claude-sonnet-4-5")
    assert result == "cloud:ok"
    assert cloud.called
    assert not local.called


@pytest.mark.asyncio
async def test_stream_heavy_routes_to_cloud():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)

    chunks = [c async for c in router.stream("sys", "user", model="claude-opus-4-6")]
    assert chunks == ["cloud:chunk"]
    assert cloud.called
    assert not local.called


@pytest.mark.asyncio
async def test_stream_standard_routes_to_mlx():
    cloud = MockProvider("cloud")
    local = MockProvider("local")
    router = _make_router(cloud, local)

    chunks = [c async for c in router.stream("sys", "user", model="claude-sonnet-4-5")]
    assert chunks == ["local:chunk"]
    assert local.called
    assert not cloud.called


@pytest.mark.asyncio
async def test_stream_mlx_failure_falls_back_to_cloud():
    cloud = MockProvider("cloud")
    local = MockProvider("local", fail=True)
    router = _make_router(cloud, local)

    chunks = [c async for c in router.stream("sys", "user", model="claude-sonnet-4-5")]
    assert chunks == ["cloud:chunk"]
    assert local.called
    assert cloud.called
