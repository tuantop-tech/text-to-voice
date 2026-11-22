"""
VieNeu-TTS OpenAI-compatible API (CPU, torch-free) cho Livestream AI.
Chay: python server.py   -> http://127.0.0.1:8000/v1
"""
import io
import os
import tempfile
import wave
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from vieneu import Vieneu

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

app = FastAPI(title="VieNeu TTS API")
_tts = None
FEATURED = (
    "Adam bựa", "Trúc Ly", "Thiện Minh", "Mai Anh", "Hải Đăng",
    "Thùy Dung", "Thiền Tâm Đức", "Ngọc Huyền", "Quang Sơn", "Ngọc Trân",
)


VOICES_FILE = os.environ.get("VIENEU_VOICES_FILE") or str(
    Path(__file__).parent / "voices" / "phuong.json"
)


def engine():
    global _tts
    if _tts is None:
        _tts = Vieneu()  # v3 Turbo, tu chon ONNX/CPU hoac PyTorch/GPU
        # Nap giong da clone (vd: Phuong) tu file di kem app — co dinh qua cac lan restart
        if os.path.exists(VOICES_FILE):
            try:
                _tts._load_voices_from_file(Path(VOICES_FILE))
                print(f"[voices] loaded custom voices from {VOICES_FILE}", flush=True)
            except Exception as exc:
                print(f"[voices] load failed: {exc}", flush=True)
    return _tts


@app.get("/health")
def health():
    return {"ok": True, "backend": engine().backend, "sample_rate": engine().sample_rate}


@app.get("/v1/models")
def models():
    return {"object": "list", "data": [{"id": "vieneu-v3-turbo", "owned_by": "vieneu"}]}


@app.get("/v1/voices")
def voices():
    out = []
    for label, voice_id in engine().list_preset_voices():
        gender = ""
        if " — Nam" in label or " · Nam" in label:
            gender = "Nam"
        elif " — Nữ" in label or " · Nữ" in label:
            gender = "Nữ"
        out.append({
            "id": voice_id,
            "name": voice_id,
            "description": label,
            "gender": gender,
            "featured": voice_id in FEATURED,
        })
    return {"object": "list", "data": out}


class SpeechRequest(BaseModel):
    model: str = "vieneu-v3-turbo"
    input: str
    voice: str | None = None
    response_format: str = "wav"
    stream_format: str = "audio"
    speed: float | None = None
    sample_rate: int = 48000


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest):
    if req.response_format.lower() != "wav":
        return JSONResponse({"error": "chi ho tro wav"}, status_code=400)
    audio = engine().infer(req.input, voice=req.voice)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(req.sample_rate or 48000)
        pcm = np.clip(audio, -1.0, 1.0) * 32767
        w.writeframes(pcm.astype("<i2").tobytes())
    return Response(content=buf.getvalue(), media_type="audio/wav")


@app.post("/v1/voices")
def add_voice(
    name: str = Form(...),
    file: UploadFile = File(...),
    denoise: bool = Form(True),
    description: str = Form(""),
):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        path = tmp.name
    try:
        engine().add_voice(name, path, denoise=denoise, description=description)
    except Exception as exc:  # ten trung preset, audio loi...
        return JSONResponse({"error": str(exc)}, status_code=400)
    finally:
        os.unlink(path)
    return {"id": name, "name": name, "object": "voice"}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
