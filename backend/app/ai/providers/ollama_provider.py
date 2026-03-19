import json
import httpx
from app.ai.provider import AIProvider
from app.config import settings


class OllamaProvider(AIProvider):
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL

    async def complete(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.AI_MODEL_STANDARD
        url = f"{self.base_url}/api/chat"
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"]

    async def stream(self, system_prompt, user_prompt, model=None, temperature=0.7, max_tokens=4096):
        model = model or settings.AI_MODEL_STANDARD
        url = f"{self.base_url}/api/chat"
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        }
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", url, json=body) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    if data.get("done"):
                        break
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
