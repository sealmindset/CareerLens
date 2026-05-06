import hashlib
import logging
import os
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

AUDIO_CACHE_DIR = Path("/tmp/interview_sim_audio")
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

VOICE_MAP = {
    "technical": "af_heart",
    "behavioral": "af_bella",
    "conversational": "am_adam",
}

_kokoro_healthy: bool | None = None


async def check_kokoro_health() -> bool:
    global _kokoro_healthy
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.KOKORO_TTS_URL}/health")
            resp.raise_for_status()
            _kokoro_healthy = True
            return True
    except Exception:
        _kokoro_healthy = False
        return False


async def synthesize_speech(
    text: str,
    interview_style: str = "behavioral",
    voice_override: str | None = None,
) -> str | None:
    global _kokoro_healthy

    if not settings.KOKORO_TTS_ENABLED:
        return None

    if _kokoro_healthy is None:
        await check_kokoro_health()
    if not _kokoro_healthy:
        logger.debug("Kokoro TTS unavailable — browser fallback will be used")
        return None

    voice = voice_override or VOICE_MAP.get(interview_style, settings.KOKORO_TTS_VOICE)
    cache_key = hashlib.sha256(f"{text}:{voice}".encode()).hexdigest()[:16]
    cached_path = AUDIO_CACHE_DIR / f"{cache_key}.wav"

    if cached_path.exists():
        return str(cached_path)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.KOKORO_TTS_URL}/v1/audio/speech",
                json={
                    "model": "kokoro",
                    "input": text,
                    "voice": voice,
                    "response_format": "wav",
                },
            )
            resp.raise_for_status()
            cached_path.write_bytes(resp.content)
            logger.info("TTS audio cached: %s (%d bytes)", cached_path.name, len(resp.content))
            return str(cached_path)
    except Exception as exc:
        logger.warning("Kokoro TTS synthesis failed: %s", exc)
        _kokoro_healthy = False
        return None


def get_audio_path(filename: str) -> Path | None:
    path = AUDIO_CACHE_DIR / filename
    if path.exists():
        return path
    return None
