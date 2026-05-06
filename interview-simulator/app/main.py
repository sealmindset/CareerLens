import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


from app.models import Base
from app.db import engine
from app.routers import audio, live, sessions
from app.services.ai_provider import ensure_model_pulled
from app.services.tts_service import check_kokoro_health

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Interview Simulator starting up...")

    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified")

    # Auto-pull Ollama model (Gemma 4)
    await ensure_model_pulled()

    # Check Kokoro TTS health
    tts_ok = await check_kokoro_health()
    if tts_ok:
        logger.info("Kokoro TTS available at %s", settings.KOKORO_TTS_URL)
    else:
        logger.warning("Kokoro TTS unavailable — browser speechSynthesis fallback will be used")

    yield

    logger.info("Interview Simulator shutting down")


app = FastAPI(
    title="CareerLens Interview Simulator",
    description="Voice-driven interview practice with communication evaluation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(live.router)
app.include_router(audio.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "interview-simulator"}
