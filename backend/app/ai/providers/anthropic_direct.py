import httpx
from app.ai.provider import AIProvider
from app.config import settings


class AnthropicDirectProvider(AIProvider):
    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.AI_MODEL_STANDARD
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }
        body = {
            "model": model,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        result = await self.complete(system_prompt, user_prompt, model, temperature, max_tokens)
        yield result
