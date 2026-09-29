import base64
import hmac
import io
import os
import wave

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

COSYVOICE_URL = os.getenv("COSYVOICE_URL", "http://cosyvoice:50000").rstrip("/")
COSYVOICE_SPK_ID = os.getenv("COSYVOICE_SPK_ID", "中文女")
TOKEN = os.getenv("TTS_WORKER_TOKEN", "")
COSYVOICE_SAMPLE_RATE = int(os.getenv("COSYVOICE_SAMPLE_RATE", "22050"))
try:
    COSYVOICE_TIMEOUT_SECONDS = float(os.getenv("COSYVOICE_TIMEOUT_SECONDS", "180"))
except ValueError:
    COSYVOICE_TIMEOUT_SECONDS = 180.0
COSYVOICE_TIMEOUT_SECONDS = min(300.0, max(5.0, COSYVOICE_TIMEOUT_SECONDS))
MAX_PCM_BYTES = 50 * 1024 * 1024

app = FastAPI(title="StudyNova CosyVoice Adapter", docs_url=None, redoc_url=None)


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)
    language: str = Field(default="zh-TW", max_length=20)
    voice: str = Field(default="default", max_length=80)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    provider: str = Field(default="cosyvoice", max_length=40)


def require_token(authorization: str | None) -> None:
    if not TOKEN:
        raise HTTPException(status_code=503, detail="TTS worker token is not configured")
    expected = f"Bearer {TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def pcm16_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    if not pcm or len(pcm) % 2:
        raise ValueError("CosyVoice returned empty or invalid int16 PCM audio")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return output.getvalue()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/v1/tts")
async def synthesize(body: TtsRequest, authorization: str | None = Header(default=None)):
    require_token(authorization)
    if body.provider != "cosyvoice":
        raise HTTPException(status_code=400, detail="This adapter only supports the cosyvoice provider")
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="Text must not be blank")

    # StudyNova's worker contract expects WAV bytes in base64 JSON. The official
    # CosyVoice FastAPI SFT route instead streams raw mono int16 PCM, so adapt it.
    # `voice` maps to the server-side configured speaker; language/speed are not
    # applied by this minimal SFT adapter.
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(COSYVOICE_TIMEOUT_SECONDS, connect=10.0)) as client:
            response = await client.post(
                f"{COSYVOICE_URL}/inference_sft",
                data={"tts_text": body.text, "spk_id": COSYVOICE_SPK_ID},
            )
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail=f"CosyVoice returned HTTP {response.status_code}")
        pcm = response.content
        if len(pcm) > MAX_PCM_BYTES:
            raise HTTPException(status_code=413, detail="Generated audio exceeds the 50 MB limit")
        wav_bytes = pcm16_to_wav(pcm, COSYVOICE_SAMPLE_RATE)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="CosyVoice inference timed out") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="CosyVoice is unavailable") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    duration_ms = round((len(pcm) // 2) * 1000 / COSYVOICE_SAMPLE_RATE)
    return {
        "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
        "mimeType": "audio/wav",
        "durationMs": duration_ms,
        "filename": "studynova-cosyvoice.wav",
    }
