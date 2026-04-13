"""AI fallback provider tests."""

import pytest

from app.ai.provider import AIProvider, FallbackAIProvider


class MockProvider(AIProvider):
    """Test provider that returns a fixed response or raises."""

    def __init__(self, name: str, fail: bool = False):
        self.name = name
        self.fail = fail
        self.called = False

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        self.called = True
        if self.fail:
            raise RuntimeError(f"{self.name} failed")
        return f"{self.name}:ok"

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        self.called = True
        if self.fail:
            raise RuntimeError(f"{self.name} stream failed")
        yield f"{self.name}:chunk"


@pytest.mark.asyncio
async def test_fallback_uses_primary_when_healthy():
    primary = MockProvider("primary")
    fallback = MockProvider("fallback")
    provider = FallbackAIProvider(primary, fallback, "fallback")

    result = await provider.complete("sys", "user")
    assert result == "primary:ok"
    assert primary.called
    assert not fallback.called


@pytest.mark.asyncio
async def test_fallback_uses_secondary_when_primary_fails():
    primary = MockProvider("primary", fail=True)
    fallback = MockProvider("fallback")
    provider = FallbackAIProvider(primary, fallback, "fallback")

    result = await provider.complete("sys", "user")
    assert result == "fallback:ok"
    assert primary.called
    assert fallback.called


@pytest.mark.asyncio
async def test_fallback_raises_when_both_fail():
    primary = MockProvider("primary", fail=True)
    fallback = MockProvider("fallback", fail=True)
    provider = FallbackAIProvider(primary, fallback, "fallback")

    with pytest.raises(RuntimeError, match="fallback failed"):
        await provider.complete("sys", "user")


@pytest.mark.asyncio
async def test_fallback_stream_uses_primary():
    primary = MockProvider("primary")
    fallback = MockProvider("fallback")
    provider = FallbackAIProvider(primary, fallback, "fallback")

    chunks = [chunk async for chunk in provider.stream("sys", "user")]
    assert chunks == ["primary:chunk"]
    assert primary.called
    assert not fallback.called


@pytest.mark.asyncio
async def test_fallback_stream_falls_back_on_failure():
    primary = MockProvider("primary", fail=True)
    fallback = MockProvider("fallback")
    provider = FallbackAIProvider(primary, fallback, "fallback")

    chunks = [chunk async for chunk in provider.stream("sys", "user")]
    assert chunks == ["fallback:chunk"]
    assert primary.called
    assert fallback.called


@pytest.mark.asyncio
async def test_fallback_passes_none_model_to_secondary():
    """Fallback passes model=None so secondary uses its own default model."""
    primary = MockProvider("primary", fail=True)

    class CapturingProvider(AIProvider):
        def __init__(self):
            self.received_model = "UNSET"

        async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
            self.received_model = model
            return "ok"

        async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
            yield "ok"

    fallback = CapturingProvider()
    provider = FallbackAIProvider(primary, fallback, "fallback")

    await provider.complete("sys", "user", model="some-primary-model")
    assert fallback.received_model is None
