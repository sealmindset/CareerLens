import logging
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_whisper_healthy: bool | None = None


async def check_whisper_health() -> bool:
    global _whisper_healthy
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.WHISPER_STT_URL}/health")
            resp.raise_for_status()
            _whisper_healthy = True
            return True
    except Exception:
        _whisper_healthy = False
        return False


async def transcribe_audio(audio_bytes: bytes, content_type: str = "audio/webm") -> dict | None:
    """Transcribe audio using faster-whisper server (OpenAI-compatible API).

    Returns {"text": "transcription", "language": "en", "segments": [...]} or None on failure.
    """
    global _whisper_healthy

    if not settings.WHISPER_STT_ENABLED:
        return None

    if _whisper_healthy is None:
        await check_whisper_health()
    if not _whisper_healthy:
        logger.debug("Whisper STT unavailable — browser Web Speech API should be used")
        return None

    ext_map = {
        "audio/webm": "webm",
        "audio/wav": "wav",
        "audio/mp4": "mp4",
        "audio/ogg": "ogg",
        "audio/mpeg": "mp3",
    }
    ext = ext_map.get(content_type, "webm")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.WHISPER_STT_URL}/v1/audio/transcriptions",
                files={"file": (f"audio.{ext}", audio_bytes, content_type)},
                data={
                    "model": "Systran/faster-whisper-large-v3",
                    "language": "en",
                    "response_format": "json",
                },
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info("Whisper transcription: %d chars", len(result.get("text", "")))
            return result
    except Exception as exc:
        logger.warning("Whisper STT transcription failed: %s", exc)
        _whisper_healthy = False
        return None
