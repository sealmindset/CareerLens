import asyncio
import os
import tempfile

from openai import AsyncOpenAI

from app.config import settings

VIDEO_EXTENSIONS = {".mov", ".mp4", ".avi", ".mkv"}
AUDIO_EXTENSIONS = {".m4a", ".wav", ".mp3", ".webm", ".ogg", ".flac"}
WHISPER_MAX_BYTES = 25 * 1024 * 1024


async def transcribe_recording(file_bytes: bytes, filename: str) -> str:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured — transcription unavailable")

    ext = os.path.splitext(filename)[1].lower()

    if ext in VIDEO_EXTENSIONS:
        audio_bytes, audio_filename = await extract_audio_from_video(file_bytes, filename)
    elif ext in AUDIO_EXTENSIONS:
        audio_bytes, audio_filename = file_bytes, filename
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    if len(audio_bytes) > WHISPER_MAX_BYTES:
        raise ValueError("Audio exceeds 25 MB Whisper limit after extraction")

    return await _call_whisper(audio_bytes, audio_filename)


async def extract_audio_from_video(file_bytes: bytes, filename: str) -> tuple[bytes, str]:
    ext = os.path.splitext(filename)[1].lower()
    inp_fd, inp_path = tempfile.mkstemp(suffix=ext)
    out_path = inp_path + ".mp3"
    try:
        with os.fdopen(inp_fd, "wb") as f:
            f.write(file_bytes)

        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-i", inp_path, "-vn", "-acodec", "libmp3lame",
            "-q:a", "4", out_path, "-y",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {stderr.decode()[:500]}")

        with open(out_path, "rb") as f:
            audio_bytes = f.read()

        base = os.path.splitext(os.path.basename(filename))[0]
        return audio_bytes, f"{base}.mp3"
    except FileNotFoundError:
        raise RuntimeError("ffmpeg is not installed — video transcription unavailable")
    finally:
        for p in (inp_path, out_path):
            if os.path.exists(p):
                os.unlink(p)


async def _call_whisper(audio_bytes: bytes, filename: str) -> str:
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    transcript = await client.audio.transcriptions.create(
        model="whisper-1",
        file=(filename, audio_bytes),
        response_format="text",
    )
    return transcript
