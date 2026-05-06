import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from app.auth import get_current_user
from app.services.stt_service import check_whisper_health, transcribe_audio
from app.services.tts_service import check_kokoro_health, get_audio_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sim/audio", tags=["audio"])


@router.get("/{filename}")
async def serve_audio(filename: str):
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = get_audio_path(filename)
    if not path:
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type="audio/wav")


@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
):
    """Server-side STT via faster-whisper. Fallback for non-Chrome browsers."""
    audio_bytes = await file.read()
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large (max 25MB)")

    result = await transcribe_audio(audio_bytes, file.content_type or "audio/webm")
    if result is None:
        raise HTTPException(status_code=503, detail="Whisper STT service unavailable")
    return result


@router.get("/tts/health")
async def tts_health():
    healthy = await check_kokoro_health()
    return {"kokoro_available": healthy}


@router.get("/stt/health")
async def stt_health():
    healthy = await check_whisper_health()
    return {"whisper_available": healthy}
