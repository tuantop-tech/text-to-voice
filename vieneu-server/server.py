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
from dataset_prep import prepare_dataset, safe_name, training_status
from finetune_runner import read_status, start_job

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

app = FastAPI(title="VieNeu TTS API")
_tts = None
_custom_engines: dict[str, object] = {}
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
    backbone_repo: str | None = None
    ref_audio: str | None = None
    use_ref_codes: bool = True


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest):
    if req.response_format.lower() != "wav":
        return JSONResponse({"error": "chi ho tro wav"}, status_code=400)
    try:
        if req.backbone_repo:
            repo = req.backbone_repo
            if not os.path.isdir(repo):
                return JSONResponse({"error": "Không tìm thấy thư mục model đã train: " + repo}, status_code=400)
            if os.path.exists(os.path.join(os.path.dirname(repo), "dry_run.json")):
                return JSONResponse(
                    {"error": "Model giả lập (dry-run) — chỉ dùng để test UI. Hãy train trên GPU để đọc giọng thật."},
                    status_code=400,
                )
            if repo not in _custom_engines:
                _custom_engines[repo] = Vieneu(mode="v3turbo", backbone_repo=repo)
            audio = _custom_engines[repo].infer(
                req.input,
                ref_audio=req.ref_audio,
                voice=req.voice,
                use_ref_codes=req.use_ref_codes,
            )
        else:
            audio = engine().infer(req.input, voice=req.voice)
    except Exception as exc:
        return JSONResponse({"error": f"Lỗi tạo giọng đã train: {exc}"}, status_code=400)
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


class PrepareDatasetRequest(BaseModel):
    data_dir: str
    voice_name: str
    files: list[str]
    model: str = "base"


@app.get("/v1/training/status")
def training_status_endpoint():
    return training_status()


@app.post("/v1/dataset/prepare")
def dataset_prepare(req: PrepareDatasetRequest):
    """Cat cac file ghi am dai thanh clip 3-15s va transcribed bang faster-whisper CPU."""
    try:
        if not req.files:
            raise ValueError("Chua co file ghi am nao")
        missing = [f for f in req.files if not os.path.exists(f)]
        if missing:
            raise ValueError("Khong tim thay file upload: " + missing[0])
        return prepare_dataset(req.data_dir, req.voice_name, req.files, req.model)
    except ImportError:
        return JSONResponse(
            {
                "error": "Chua cai faster-whisper. Chay: pip install -r vieneu-server/requirements-training.txt"
            },
            status_code=400,
        )
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


class FinetuneStartRequest(BaseModel):
    data_dir: str
    voice_name: str
    params: dict
    repo_dir: str = ""


@app.post("/v1/finetune/start")
def finetune_start(req: FinetuneStartRequest):
    try:
        return start_job(req.data_dir, req.voice_name, req.params, req.repo_dir)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


@app.get("/v1/finetune/status")
def finetune_status(data_dir: str, voice_name: str):
    root = Path(data_dir).resolve() / "datasets" / safe_name(voice_name)
    return read_status(root)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
