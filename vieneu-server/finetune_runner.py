"""Chay pipeline LoRA chinh thuc cua VieNeu-TTS (finetune/) hoac mo phong khi khong co GPU.

Moi job ghi trang thai realtime vao <dataset_dir>/finetune_status.json de UI poll.
Khong hardcode duong dan may: moi thuong muc duoc tinh tu data_dir do app truyen sang.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import wave
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

STATUS_FILE = "finetune_status.json"
_lock = threading.Lock()
_jobs: dict[str, threading.Thread] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def status_path(dataset_dir: str | Path) -> Path:
    return Path(dataset_dir) / STATUS_FILE


def read_status(dataset_dir: str | Path) -> dict:
    p = status_path(dataset_dir)
    if not p.exists():
        return {"status": "idle", "progress": 0, "log": [], "mode": "", "gpu": False}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {"status": "idle", "progress": 0, "log": [], "mode": "", "gpu": False}


def _write(dataset_dir: Path, state: dict) -> None:
    state["updatedAt"] = _now()
    state["log"] = state.get("log", [])[-400:]
    with _lock:
        status_path(dataset_dir).write_text(
            json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8"
        )


def _append(dataset_dir: Path, state: dict, line: str, progress: int | None = None) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    state.setdefault("log", []).append(f"[{stamp}] {line.rstrip()}")
    if progress is not None:
        state["progress"] = max(0, min(100, int(progress)))
    _write(dataset_dir, state)


def _run_cmd(dataset_dir: Path, state: dict, cmd: list[str], cwd: Path, lo: int, hi: int) -> bool:
    _append(dataset_dir, state, "$ " + " ".join(str(x) for x in cmd))
    try:
        proc = subprocess.Popen(
            [str(x) for x in cmd],
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
    except Exception as exc:
        _append(dataset_dir, state, f"❌ Không chạy được lệnh: {exc}")
        return False

    assert proc.stdout is not None
    for raw in proc.stdout:
        line = raw.rstrip()
        if not line:
            continue
        m = re.search(r"step\s+(\d+)/(\d+)", line)
        if m:
            cur, total = int(m.group(1)), int(m.group(2))
            if total > 0:
                _append(dataset_dir, state, line, lo + (hi - lo) * cur / total)
                continue
        _append(dataset_dir, state, line)
    proc.wait()
    if proc.returncode != 0:
        _append(dataset_dir, state, f"❌ Lệnh thất bại (exit {proc.returncode})")
        return False
    _append(dataset_dir, state, "✅ Hoàn tất bước", hi)
    return True


def _pick_sample(dataset_dir: Path) -> tuple[Path, str, float]:
    """Chon clip 5-8s (hoac gan nhat) lam audio mau, kem transcript tu segments.json."""
    seg_file = dataset_dir / "segments.json"
    texts = {}
    if seg_file.exists():
        try:
            for s in json.loads(seg_file.read_text(encoding="utf-8")).get("segments", []):
                texts[s.get("file", "")] = s.get("text", "")
        except Exception:
            pass
    best = None
    for wav in sorted((dataset_dir / "raw_audio").glob("*.wav")):
        try:
            with wave.open(str(wav), "rb") as w:
                dur = w.getnframes() / float(w.getframerate())
        except Exception:
            continue
        score = 0.0 if 5.0 <= dur <= 8.0 else abs(dur - 6.5)
        if best is None or score < best[0]:
            best = (score, wav, dur)
    if best is None:
        raise ValueError("Không có clip audio nào trong dataset để làm mẫu")
    return best[1], texts.get(best[1].name, ""), best[2]


def package_voice(
    data_dir: Path,
    name: str,
    merged_dir: Path,
    repo_dir: Path | None,
    dry_run: bool,
    state: dict,
) -> dict:
    """Dong goi model + audio mau 5-8s vao ./outputs/trained_voices/<ten>."""
    data_root = Path(data_dir).resolve()
    out_root = data_root / "outputs" / "trained_voices" / name
    model_out = out_root / "model"
    if model_out.exists():
        shutil.rmtree(model_out)
    shutil.copytree(merged_dir, model_out)

    sample_src, transcript, duration = _pick_sample(data_root / "datasets" / name)
    shutil.copy2(sample_src, out_root / "sample.wav")
    (out_root / "transcript.txt").write_text(transcript, encoding="utf-8")

    if dry_run or repo_dir is None or not (repo_dir / "finetune" / "make_voice.py").exists():
        (model_out / "voices_v3_turbo.json").write_text(
            json.dumps({"presets": {}, "default_voice": ""}, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        (out_root / "dry_run.json").write_text(
            json.dumps({"dryRun": True, "reason": "CPU / no CUDA — model giả lập"}, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
    else:
        cmd = [
            sys.executable,
            repo_dir / "finetune" / "make_voice.py",
            "--audio", out_root / "sample.wav",
            "--name", name,
            "--description", "Giọng đã huấn luyện LoRA",
            "--out", model_out,
            "--default",
        ]
        _append(data_root / "datasets" / name, state, "$ " + " ".join(str(x) for x in cmd))
        proc = subprocess.run([str(x) for x in cmd], cwd=str(repo_dir), capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
        for line in (proc.stdout or "").splitlines():
            _append(data_root / "datasets" / name, state, line)
        if proc.returncode != 0:
            raise RuntimeError(f"make_voice.py thất bại: {(proc.stderr or '').strip()[:300]}")

    info = {
        "name": name,
        "label": f"{name} [Custom Fine-tuned]",
        "modelDir": f"outputs/trained_voices/{name}/model",
        "sampleFile": f"outputs/trained_voices/{name}/sample.wav",
        "transcript": transcript,
        "sampleDuration": round(duration, 2),
        "dryRun": dry_run,
        "createdAt": _now(),
    }
    (out_root / "voice.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _append(
        data_root / "datasets" / name,
        state,
        f"📦 Đóng gói giọng: {out_root} (mẫu {duration:.1f}s)",
        99,
    )
    return info


def _dry_run(dataset_dir: Path, state: dict, name: str, epochs: int, batch: int, lr: float) -> None:
    model_dir = dataset_dir / "model" / "merged"
    adapter_dir = dataset_dir / "model" / "adapter"
    model_dir.mkdir(parents=True, exist_ok=True)
    adapter_dir.mkdir(parents=True, exist_ok=True)

    _append(dataset_dir, state, "⚠️ torch.cuda.is_available() = False → CHẾ ĐỘ GIẢ LẬP (dry-run), không train thật.", 2)
    _append(dataset_dir, state, f"[1/3] prepare_dataset.py → {dataset_dir / 'train.parquet'} (mô phỏng)", 10)
    time.sleep(2)
    n = len(list((dataset_dir / "raw_audio").glob("*.wav")))
    _append(dataset_dir, state, f"  {n} clip được mã hoá → train.parquet", 22)
    _append(dataset_dir, state, f"[2/3] train_lora.py: epochs={epochs} batch={batch} lr={lr}", 25)
    for i in range(1, 13):
        time.sleep(0.5)
        _append(
            dataset_dir,
            state,
            f"  step {i}/12  loss {0.9 - i * 0.06:.4f}  acc_cb0 {0.21 + i * 0.02:.3f}  (mô phỏng)",
            25 + i * 4,
        )
    _append(dataset_dir, state, "  adapter saved (mô phỏng)", 76)
    _append(dataset_dir, state, "[3/3] merge_lora.py → model/merged (mô phỏng)", 82)
    time.sleep(1.5)

    (model_dir / "config.json").write_text(
        json.dumps({"model_type": "vieneu-v3-turbo", "mode": "dry-run", "voice": name}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (model_dir / "voices_v3_turbo.json").write_text(
        json.dumps({"data": [{"id": name, "name": name, "description": "DRY-RUN (CPU)"}]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (model_dir / "README.txt").write_text(
        "Thư mục model GIẢ LẬP tạo bởi chế độ dry-run (máy không có CUDA).\n"
        "Chạy lại trên máy có GPU NVIDIA để huấn luyện LoRA thật.\n",
        encoding="utf-8",
    )
    (adapter_dir / "adapter_config.json").write_text("{}", encoding="utf-8")

    state["phase"] = "packaging"
    try:
        state["packaged"] = package_voice(dataset_dir.parent.parent, name, model_dir, None, True, state)
    except Exception as exc:
        _append(dataset_dir, state, f"⚠️ Đóng gói mẫu thất bại: {exc}")

    state.update(
        {
            "status": "done",
            "phase": "xong",
            "progress": 100,
            "mode": "dry_run",
            "gpu": False,
            "modelDir": str(model_dir),
            "finishedAt": _now(),
        }
    )
    _append(dataset_dir, state, f"✅ DRY-RUN hoàn tất. Model giả lập: {model_dir}", 100)


def _pipeline(dataset_dir: Path, state: dict, name: str, params: dict, repo_dir: Path) -> None:
    finetune = repo_dir / "finetune"
    missing = [f for f in ("prepare_dataset.py", "train_lora.py", "merge_lora.py") if not (finetune / f).exists()]
    if missing:
        raise FileNotFoundError(
            f"Thiếu script chính thức trong {finetune}: {', '.join(missing)}. "
            "Clone https://github.com/pnnbao97/VieNeu-TTS vào thư mục repo đã cấu hình."
        )

    epochs = float(params.get("epochs", 3))
    batch = int(params.get("batchSize", 4))
    lr = float(params.get("lr", 0.0002))
    grad_accum = int(params.get("gradAccum", 4))
    run_dir = dataset_dir / "model"
    run_dir.mkdir(parents=True, exist_ok=True)

    _append(dataset_dir, state, f"🚀 GPU CUDA detected — chạy pipeline thật từ {finetune}", 3)

    state["phase"] = "prepare"
    if not _run_cmd(
        dataset_dir,
        state,
        [sys.executable, finetune / "prepare_dataset.py", "--dataset-dir", dataset_dir],
        repo_dir,
        5,
        20,
    ):
        raise RuntimeError("Tiền xử lý dữ liệu thất bại")

    state["phase"] = "train"
    if not _run_cmd(
        dataset_dir,
        state,
        [
            sys.executable,
            finetune / "train_lora.py",
            "--data", dataset_dir / "train.parquet",
            "--run", name,
            "--output-dir", run_dir,
            "--epochs", epochs,
            "--batch-size", batch,
            "--grad-accum", grad_accum,
            "--lr", lr,
            "--merge",
        ],
        repo_dir,
        20,
        88,
    ):
        raise RuntimeError("train_lora.py thất bại")

    state["phase"] = "merge"
    merged = run_dir / name / "merged"
    if not _run_cmd(
        dataset_dir,
        state,
        [
            sys.executable,
            finetune / "merge_lora.py",
            "--adapter", run_dir / name / "adapter",
            "--out", merged,
        ],
        repo_dir,
        88,
        96,
    ):
        raise RuntimeError("merge_lora.py thất bại")

    state["phase"] = "packaging"
    state["packaged"] = package_voice(dataset_dir.parent.parent, name, merged, repo_dir, False, state)

    state.update(
        {
            "status": "done",
            "phase": "xong",
            "progress": 100,
            "mode": "gpu",
            "gpu": True,
            "modelDir": str(merged),
            "finishedAt": _now(),
        }
    )
    _append(dataset_dir, state, f"✅ Huấn luyện xong. Model: {merged}", 100)


def _worker(dataset_dir: Path, name: str, params: dict, repo_dir: Path | None) -> None:
    state = read_status(dataset_dir)
    state.update(
        {
            "status": "running",
            "phase": "kiểm tra phần cứng",
            "progress": 0,
            "log": [],
            "mode": "",
            "gpu": False,
            "error": "",
            "voiceName": name,
            "startedAt": _now(),
            "finishedAt": "",
        }
    )
    _write(dataset_dir, state)
    try:
        try:
            import torch

            has_gpu = bool(torch.cuda.is_available())
            gpu_name = torch.cuda.get_device_name(0) if has_gpu else ""
        except Exception as exc:
            has_gpu = False
            gpu_name = ""
            _append(dataset_dir, state, f"Không import được torch ({exc}) → dùng dry-run.")

        state["gpu"] = has_gpu
        if has_gpu:
            _append(dataset_dir, state, f"CUDA OK: {gpu_name}")
            if repo_dir is None:
                raise FileNotFoundError("Chưa cấu hình thư mục repo VieNeu-TTS")
            _pipeline(dataset_dir, state, name, params, repo_dir)
        else:
            state["mode"] = "dry_run"
            _dry_run(dataset_dir, state, name, int(params.get("epochs", 3)), int(params.get("batchSize", 4)), float(params.get("lr", 0.0002)))
    except Exception as exc:
        state.update({"status": "error", "error": str(exc), "finishedAt": _now()})
        _append(dataset_dir, state, f"❌ {exc}")
    finally:
        _write(dataset_dir, state)


def start_job(data_dir: str, voice_name: str, params: dict, repo_dir: str = "") -> dict:
    """Khoi dong thread background. Tra ve trang thai ban dau."""
    from dataset_prep import safe_name

    name = safe_name(voice_name)
    dataset_dir = Path(data_dir).resolve() / "datasets" / name
    if not (dataset_dir / "metadata.csv").exists():
        raise ValueError("Chưa có dataset. Hãy chuẩn bị dữ liệu trước.")

    resolved_repo: Path | None = None
    if repo_dir.strip():
        candidate = Path(str(repo_dir))
        if not candidate.is_absolute():
            candidate = Path(data_dir).resolve() / str(repo_dir).lstrip("./\\")
        resolved_repo = candidate

    state = read_status(dataset_dir)
    if state.get("status") == "running":
        return {"started": False, "status": "running", "reason": "Job đang chạy"}

    thread = threading.Thread(
        target=_worker, args=(dataset_dir, name, params, resolved_repo), daemon=True
    )
    _jobs[name] = thread
    thread.start()
    return {"started": True, "voiceName": name, "statusUrl": f"finetune_status.json"}
