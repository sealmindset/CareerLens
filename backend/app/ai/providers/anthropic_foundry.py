"""Azure AI Foundry provider using httpx with Bearer auth.

Azure AI Foundry requires Authorization: Bearer <token> (not x-api-key).
We use direct httpx calls against the Anthropic-compatible /v1/messages endpoint.
"""

import logging
from typing import AsyncIterator

import httpx

from app.ai.azure_token import get_fresh_az_token
from app.ai.provider import AIProvider
from app.config import settings

logger = logging.getLogger(__name__)

_ANTHROPIC_VERSION = "2023-06-01"


def _get_bearer_token() -> str:
    """Get a Bearer token: prefer fresh MSAL token, fall back to API key."""
    token = get_fresh_az_token()
    if token:
        return token
    if settings.AZURE_AI_FOUNDRY_API_KEY:
        return settings.AZURE_AI_FOUNDRY_API_KEY
    raise ValueError(
        "No Azure AI Foundry credentials available. "
        "Run 'az login' or set AZURE_AI_FOUNDRY_API_KEY in .env."
    )


def _build_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "anthropic-version": _ANTHROPIC_VERSION,
    }


class AnthropicFoundryProvider(AIProvider):
    """Azure AI Foundry provider using httpx with Bearer auth."""

    def __init__(self):
        endpoint = settings.AZURE_AI_FOUNDRY_ENDPOINT.rstrip("/")
        self.messages_url = f"{endpoint}/v1/messages"

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.AI_MODEL_STANDARD
        token = _get_bearer_token()

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                self.messages_url,
                headers=_build_headers(token),
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096) -> AsyncIterator[str]:
        model = model or settings.AI_MODEL_STANDARD
        token = _get_bearer_token()

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                self.messages_url,
                headers=_build_headers(token),
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        import json
                        chunk = line[6:]
                        if chunk.strip() == "[DONE]":
                            break
                        try:
                            event = json.loads(chunk)
                            if event.get("type") == "content_block_delta":
                                delta = event.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    yield delta["text"]
                        except json.JSONDecodeError:
                            continue
