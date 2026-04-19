import json

import httpx

from app.ai.provider import AIProvider
from app.config import settings


class MLXProvider(AIProvider):
    """Local MLX inference via mlx_lm.server (OpenAI-compatible API)."""

    def __init__(self):
        self.base_url = settings.MLX_BASE_URL.rstrip("/")
        self._timeout = settings.MLX_TIMEOUT

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.MLX_MODEL_STANDARD
        url = f"{self.base_url}/v1/chat/completions"
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.MLX_MODEL_STANDARD
        url = f"{self.base_url}/v1/chat/completions"
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream("POST", url, json=body) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if payload.strip() == "[DONE]":
                        break
                    data = json.loads(payload)
                    content = data["choices"][0].get("delta", {}).get("content")
                    if content:
                        yield content
