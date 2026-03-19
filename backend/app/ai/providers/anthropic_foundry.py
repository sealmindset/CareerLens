import httpx
from app.ai.provider import AIProvider
from app.config import settings


class AnthropicFoundryProvider(AIProvider):
    def __init__(self):
        self.endpoint = settings.AZURE_AI_FOUNDRY_ENDPOINT
        self.api_key = settings.AZURE_AI_FOUNDRY_API_KEY

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.AI_MODEL_STANDARD
        url = f"{self.endpoint}/models/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        # Simplified - yields complete response for now
        result = await self.complete(system_prompt, user_prompt, model, temperature, max_tokens)
        yield result
