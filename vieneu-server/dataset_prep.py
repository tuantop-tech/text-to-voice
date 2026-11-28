"""Chuan bi dataset fine-tuning: cat audio dai thanh clip 3-15s + transcribed bang faster-whisper CPU.

Moi duong dan duoc tinh tu data_dir do app truyen sang (thuong la ./data tu process.cwd()),
khong hardcode duong dan may.
"""
from __future__ import annotations

import json
import math
import re
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000
MIN_MS = 3000
MAX_MS = 15000
SILENCE_MS = 350
THRESH_DB = -38.0

_MODELS: dict = {}


def safe_name(raw: str) -> str:
    name = re.sub(r'[\\/:*?"<>|]+', "_", (raw or "").strip())
    name = re.sub(r"\s+", " ", name)[:60]
    if not name or name in (".", ".."):
        raise ValueError("Ten giong khong hop le")
    return name


def decode_16k_mono(path: str | Path) -> np.ndarray:
    """Doc wav/mp3 thanh PCM float32 16kHz mono bang PyAV (khong can ffmpeg CLI)."""
    import av

    container = av.open(str(path))
    stream = next((s for s in container.streams if s.type == "audio"), None)
    if stream is None:
        raise ValueError("Khong co audio trong file: " + str(path))
    resampler = av.audio.resampler.AudioResampler(
        format="s16", layout="mono", rate=SAMPLE_RATE
    )
    parts = []
    for frame in container.decode(stream):
        for rf in resampler.resample(frame):
            parts.append(rf.to_ndarray().reshape(-1).astype(np.float32) / 32768.0)
    for rf in resampler.resample(None) or []:
        parts.append(rf.to_ndarray().reshape(-1).astype(np.float32) / 32768.0)
    container.close()
    if not parts:
        raise ValueError("Khong doc duoc audio: " + str(path))
    return np.concatenate(parts)


def _rms_db(x: np.ndarray) -> float:
    rms = float(np.sqrt(np.mean(x * x))) if x.size else 0.0
    return 20 * math.log10(max(rms, 1e-7))


def split_segments(pcm: np.ndarray, sr: int = SAMPLE_RATE):
    """Tra ve list (start_sample, end_sample) do dai 3-15s, uu tien cat o doan im lang."""
    win = int(sr * 0.02)
    n = len(pcm) // win
    if n == 0:
        return []
    levels = [_rms_db(pcm[i * win : (i + 1) * win]) for i in range(n)]
    silent = [v < THRESH_DB for v in levels]
    min_w = max(1, int(MIN_MS / 1000 * sr / win))
    max_w = max(2, int(MAX_MS / 1000 * sr / win))
    sil_w = max(1, int(SILENCE_MS / 1000 * sr / win))

    chunks: list[tuple[int, int]] = []
    start = 0
    while start < n:
        while start < n and silent[start]:
            start += 1
        if start >= n:
            break
        limit = min(n, start + max_w)
        cut = -1
        run = 0
        for j in range(start + min_w, limit):
            if silent[j]:
                run += 1
                if run >= sil_w:
                    cut = j - run + 1
                    break
            else:
                run = 0
        if cut <= start:
            cut = limit
        chunks.append((start, cut))
        start = cut

    # Doan cuoi qua ngan -> gop vao doan truoc
    if len(chunks) > 1:
        s, e = chunks[-1]
        if (e - s) * win / sr * 1000 < MIN_MS:
            chunks[-2] = (chunks[-2][0], e)
            chunks.pop()
    return [(int(s * win), int(e * win)) for s, e in chunks if e > s]


def write_wav(path: str | Path, pcm: np.ndarray, sr: int = SAMPLE_RATE) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(pcm, -1.0, 1.0) * 32767).astype("<i2").tobytes())


def transcribe(path: str | Path, model_size: str, download_root: str | Path) -> str:
    from faster_whisper import WhisperModel  # import muon: CPU may chua cai

    key = (model_size, str(download_root))
    if key not in _MODELS:
        Path(download_root).mkdir(parents=True, exist_ok=True)
        _MODELS[key] = WhisperModel(
            model_size, device="cpu", compute_type="int8", download_root=str(download_root)
        )
    segments, _info = _MODELS[key].transcribe(
        str(path), language="vi", beam_size=5, vad_filter=False
    )
    return " ".join(s.text.strip() for s in segments).strip()


def write_metadata(root: Path, segments: list[dict]) -> None:
    lines = [
        f"{s['file']}|{str(s.get('text','')).replace('|',' ').replace(chr(13),' ').replace(chr(10),' ').strip()}"
        for s in segments
    ]
    (root / "metadata.csv").write_text(
        "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"
    )


def prepare_dataset(data_dir: str, voice_name: str, files: list[str], model: str = "base") -> dict:
    name = safe_name(voice_name)
    root = Path(data_dir).resolve() / "datasets" / name
    raw = root / "raw_audio"
    raw.mkdir(parents=True, exist_ok=True)
    download_root = Path(data_dir).resolve() / "models" / "whisper"

    out: list[dict] = []
    idx = 0
    for file in files:
        pcm = decode_16k_mono(file)
        for start, end in split_segments(pcm):
            clip = pcm[start:end]
            if len(clip) < SAMPLE_RATE * 2:
                continue
            idx += 1
            fname = f"clip_{idx:04d}.wav"
            write_wav(raw / fname, clip)
            text = transcribe(raw / fname, model, download_root)
            out.append(
                {
                    "file": fname,
                    "text": text,
                    "duration_ms": int(len(clip) / SAMPLE_RATE * 1000),
                    "start_ms": int(start / SAMPLE_RATE * 1000),
                    "end_ms": int(end / SAMPLE_RATE * 1000),
                }
            )

    ds = {
        "voiceName": name,
        "model": model,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "segments": out,
    }
    (root / "segments.json").write_text(
        json.dumps(ds, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_metadata(root, out)
    return ds


def training_status() -> dict:
    try:
        import faster_whisper  # noqa: F401

        whisper_ok = True
    except Exception as exc:
        whisper_ok = False
    try:
        import av  # noqa: F401

        av_ok = True
    except Exception as exc:
        av_ok = False
    return {"faster_whisper": whisper_ok, "av": av_ok}
