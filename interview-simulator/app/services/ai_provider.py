import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_ollama_healthy: bool | None = None


async def _check_ollama() -> bool:
    global _ollama_healthy
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            _ollama_healthy = True
            return True
    except Exception:
        _ollama_healthy = False
        return False


async def ensure_model_pulled() -> None:
    if not settings.OLLAMA_AUTO_PULL:
        return
    if not await _check_ollama():
        logger.warning("Ollama not reachable at %s — skipping auto-pull", settings.OLLAMA_BASE_URL)
        return

    model = settings.OLLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            tags = resp.json()
            installed = [m["name"] for m in tags.get("models", [])]
            if model in installed:
                logger.info("Ollama model %s already available", model)
                return

        logger.info("Auto-pulling Ollama model %s (this may take a few minutes)...", model)
        async with httpx.AsyncClient(timeout=600) as client:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/pull",
                json={"name": model},
            )
            resp.raise_for_status()
            logger.info("Ollama model %s pulled successfully", model)
    except Exception as exc:
        logger.warning("Failed to auto-pull Ollama model %s: %s", model, exc)


async def _call_ollama(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    url = f"{settings.OLLAMA_BASE_URL}/api/chat"
    body = {
        "model": settings.OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": temperature},
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]


async def _call_anthropic(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.ANTHROPIC_MODEL_STANDARD,
        "max_tokens": 4096,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]


async def _call_openai(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.OPENAI_MODEL_STANDARD,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": 4096,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def ai_complete(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    global _ollama_healthy

    # Try Ollama first (Gemma 4, zero cost)
    if _ollama_healthy is None:
        await _check_ollama()

    if _ollama_healthy:
        try:
            result = await _call_ollama(system_prompt, user_prompt, temperature)
            return result
        except Exception as exc:
            logger.warning("Ollama failed, falling back: %s", exc)
            _ollama_healthy = False

    # Fallback chain: Anthropic → OpenAI
    if settings.ANTHROPIC_API_KEY:
        try:
            return await _call_anthropic(system_prompt, user_prompt, temperature)
        except Exception as exc:
            logger.warning("Anthropic failed: %s", exc)

    if settings.OPENAI_API_KEY:
        try:
            return await _call_openai(system_prompt, user_prompt, temperature)
        except Exception as exc:
            logger.warning("OpenAI failed: %s", exc)

    raise RuntimeError(
        "All AI providers failed. Ensure Ollama is running with gemma4:26b, "
        "or set ANTHROPIC_API_KEY / OPENAI_API_KEY as fallback."
    )


def parse_json_response(text: str) -> list | dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    return json.loads(text)
