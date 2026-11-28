"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Segment = {
  file: string;
  text: string;
  duration_ms: number;
  start_ms: number;
  end_ms: number;
};
type Dataset = {
  voiceName: string;
  model: string;
  createdAt: string;
  segments: Segment[];
};
type DatasetItem = { name: string; count: number; createdAt: string; model: string };
type FinetuneStatus = {
  status: string;
  phase?: string;
  progress: number;
  log: string[];
  mode?: string;
  gpu?: boolean;
  error?: string;
  modelDir?: string;
};

export default function TrainingPage() {
  const [tab, setTab] = useState<"new" | "saved">("new");
  const [voiceName, setVoiceName] = useState("");
  const [model, setModel] = useState("base");
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [epochs, setEpochs] = useState(3);
  const [batchSize, setBatchSize] = useState(4);
  const [lr, setLr] = useState("0.0002");
  const [repoDir, setRepoDir] = useState("./vieneu-src");
  const [ft, setFt] = useState<FinetuneStatus | null>(null);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const [ready, setReady] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<{ faster_whisper: boolean; error?: string }>("/api/training/status")
      .then((r) => {
        setReady(Boolean(r.faster_whisper));
        setStatusError(r.error || "");
      })
      .catch((e) => {
        setReady(false);
        setStatusError(e.message);
      });
    api<{ datasets: DatasetItem[] }>("/api/training/datasets")
      .then((r) => setDatasets(r.datasets))
      .catch(() => {});
  }, []);

  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (!voiceName.trim()) return setError("Nhập tên giọng nói");
    if (!files.length) return setError("Chọn ít nhất 1 file ghi âm dài");
    setBusy(true);
    setError("");
    setNotice("");
    setDataset(null);
    try {
      const form = new FormData();
      form.append("voiceName", voiceName);
      form.append("model", model);
      files.forEach((f) => form.append("files", f));
      const r = await api<{ dataset: Dataset; metadataPath: string }>("/api/training/prepare", {
        method: "POST",
        body: form,
      });
      setDataset(r.dataset);
      setNotice(`Đã cắt ${r.dataset.segments.length} đoạn. metadata.csv: ./data/${r.metadataPath}`);
      const d = await api<{ datasets: DatasetItem[] }>("/api/training/datasets");
      setDatasets(d.datasets);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openDataset(name: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ dataset: Dataset }>(
        `/api/training/segments?voice=${encodeURIComponent(name)}`
      );
      setDataset(r.dataset);
      setVoiceName(r.dataset.voiceName);
      setTab("new");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function changeText(idx: number, text: string) {
    setDataset((d) =>
      d ? { ...d, segments: d.segments.map((s, i) => (i === idx ? { ...s, text } : s)) } : d
    );
  }

  async function save() {
    if (!dataset) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<{ dataset: Dataset }>("/api/training/segments", {
        method: "POST",
        body: JSON.stringify({ voice: dataset.voiceName, segments: dataset.segments }),
      });
      setDataset(r.dataset);
      setNotice("Đã lưu metadata.csv và segments.json.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startTraining() {
    if (!dataset) return setError("Hãy chuẩn bị dataset trước khi huấn luyện");
    setTrainingBusy(true);
    setError("");
    setNotice("");
    setFt(null);
    try {
      await api("/api/training/finetune/start", {
        method: "POST",
        body: JSON.stringify({
          voice: dataset.voiceName,
          epochs,
          batchSize,
          lr: Number(lr),
          repoDir,
        }),
      });
      setNotice("Đã bắt đầu huấn luyện. Đang cập nhật log theo thời gian thực...");
      setPollTick((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTrainingBusy(false);
    }
  }

  useEffect(() => {
    if (!dataset?.voiceName) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const r = await api<FinetuneStatus>(
          `/api/training/finetune/status?voice=${encodeURIComponent(dataset.voiceName)}`
        );
        if (!alive) return;
        setFt(r);
        if (r.status === "running") timer = setTimeout(poll, 1000);
      } catch {
        /* chua co status */
      }
    };
    poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [dataset?.voiceName, pollTick]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">🧠 Huấn luyện giọng (Fine-tuning)</h1>
        <p className="mt-1 text-sm text-slate-400">
          Giai đoạn 1 — cắt ghi âm dài thành clip 3–15 giây, tự nhận diện chữ bằng faster-whisper trên CPU.
          Dữ liệu lưu tại <code className="text-sky-300">./data/datasets/&lt;tên giọng&gt;/</code>.
        </p>
      </header>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("new")}
          className={`rounded-xl px-4 py-2 text-sm ${tab === "new" ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-300"}`}
        >
          Tạo dataset
        </button>
        <button
          onClick={() => setTab("saved")}
          className={`rounded-xl px-4 py-2 text-sm ${tab === "saved" ? "bg-sky-500 text-white" : "bg-slate-800 text-slate-300"}`}
        >
          Dataset đã lưu ({datasets.length})
        </button>
      </div>

      {ready === false && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">
          ⚠️ Server giọng chưa có <b>faster-whisper</b>. Cài trên máy sẽ train:{" "}
          <code>pip install -r requirements.txt</code>
          {statusError && <p className="mt-1 text-xs text-amber-300/80">{statusError}</p>}
        </div>
      )}
      {error && <p className="rounded-lg bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-950/40 p-3 text-sm text-emerald-300">{notice}</p>}

      {tab === "new" ? (
        <>
          <form
            onSubmit={prepare}
            className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-400">Tên giọng nói</span>
                <input
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="Ví dụ: PhuongLive"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Model nhận diện (CPU)</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm"
                >
                  <option value="base">base — nhanh hơn</option>
                  <option value="small">small — chính xác hơn</option>
                </select>
              </label>
            </div>
            <div>
              <span className="text-xs text-slate-400">File ghi âm dài (.wav, .mp3)</span>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  setFiles((cur) => [...cur, ...Array.from(e.dataTransfer.files)]);
                }}
                className={`mt-1 rounded-xl border-2 border-dashed p-6 text-center transition ${
                  drag ? "border-sky-400 bg-sky-500/10" : "border-slate-700 bg-slate-950/40"
                }`}
              >
                <input
                  id="voice-files"
                  type="file"
                  multiple
                  accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*"
                  onChange={(e) => setFiles((cur) => [...cur, ...Array.from(e.target.files || [])])}
                  className="hidden"
                />
                <label
                  htmlFor="voice-files"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sky-500 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-400"
                >
                  📁 Chọn file ghi âm
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  hoặc kéo thả file vào đây — có thể chọn nhiều file cùng lúc
                </p>
              </div>

              {files.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-300">Đã chọn {files.length} file</p>
                    <button
                      type="button"
                      onClick={() => setFiles([])}
                      className="text-xs text-rose-400 hover:text-rose-300"
                    >
                      Xóa tất cả
                    </button>
                  </div>
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between text-xs text-slate-400">
                        <span className="truncate">{f.name} ({(f.size / 1048576).toFixed(1)} MB)</span>
                        <button
                          type="button"
                          onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                          className="ml-3 text-rose-400 hover:text-rose-300"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-sky-500 py-3 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {busy ? "Đang cắt & nhận diện..." : "✂️ Cắt đoạn & Nhận diện giọng nói"}
            </button>
          </form>

          {dataset && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {dataset.voiceName} — {dataset.segments.length} đoạn
                </h2>
                <button
                  onClick={save}
                  disabled={busy}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  💾 Lưu thay đổi
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Nghe thử từng đoạn và sửa chính tả trước khi lưu. File lưu tại{" "}
                <code>./data/datasets/{dataset.voiceName}/raw_audio/</code>.
              </p>
              <div className="space-y-3">
                {dataset.segments.map((s, i) => (
                  <div
                    key={s.file}
                    className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 md:grid-cols-[220px_1fr]"
                  >
                    <div>
                      <p className="text-xs font-medium text-sky-300">
                        Đoạn {i + 1} · {(s.duration_ms / 1000).toFixed(1)}s
                      </p>
                      <audio
                        controls
                        preload="none"
                        className="mt-2 h-9 w-full"
                        src={`/api/training/audio?voice=${encodeURIComponent(dataset.voiceName)}&file=${encodeURIComponent(s.file)}`}
                      />
                      <p className="mt-1 truncate text-[11px] text-slate-500">{s.file}</p>
                    </div>
                    <textarea
                      value={s.text}
                      onChange={(e) => changeText(i, e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm"
                      placeholder="Nhập nội dung lời thoại cho đoạn này..."
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {dataset && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-semibold">⚙️ Huấn luyện LoRA</h2>
                {ft && (
                  <span className={`badge rounded-lg px-3 py-1 text-xs ${ft.gpu ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                    {ft.gpu ? "GPU CUDA" : ft.mode === "dry_run" ? "DRY-RUN (CPU)" : "Chưa kiểm tra"}
                  </span>
                )}
              </div>
              <p className="mb-4 text-xs text-slate-500">
                Mặc định tối ưu cho GPU 6–8GB VRAM: <b>epochs 3</b>, <b>batch 4 × grad-accum 4 = 16</b>,{" "}
                <b>lr 2e-4</b>. Pipeline: prepare_dataset.py → train_lora.py → merge_lora.py.
              </p>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="block">
                  <span className="text-xs text-slate-400">Epochs</span>
                  <input type="number" min={1} value={epochs} onChange={(e) => setEpochs(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Batch size</span>
                  <input type="number" min={1} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Learning rate</span>
                  <input value={lr} onChange={(e) => setLr(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Repo VieNeu-TTS</span>
                  <input value={repoDir} onChange={(e) => setRepoDir(e.target.value)}
                    placeholder="./vieneu-src"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm" />
                </label>
              </div>
              <button
                onClick={startTraining}
                disabled={trainingBusy || ft?.status === "running"}
                className="mt-4 w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
              >
                {ft?.status === "running" ? "Đang huấn luyện..." : "🚀 Bắt đầu huấn luyện"}
              </button>

              {ft && ft.status !== "idle" && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{ft.phase || ft.status} · {ft.mode === "dry_run" ? "mô phỏng" : ft.mode || "—"}</span>
                    <span>{ft.progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-sky-500 transition-all" style={{ width: `${ft.progress}%` }} />
                  </div>
                  {ft.error && <p className="text-sm text-rose-300">❌ {ft.error}</p>}
                  {ft.modelDir && <p className="text-xs text-emerald-300">📦 Model: <code>{ft.modelDir}</code></p>}
                  <pre className="max-h-64 overflow-y-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-300">
                    {(ft.log || []).slice(-80).join("\n")}
                  </pre>
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          {datasets.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dataset nào.</p>
          ) : (
            <div className="space-y-2">
              {datasets.map((d) => (
                <button
                  key={d.name}
                  onClick={() => openDataset(d.name)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-left hover:border-sky-700"
                >
                  <div>
                    <p className="font-medium text-slate-200">{d.name}</p>
                    <p className="text-xs text-slate-500">
                      {d.count} đoạn · model {d.model || "base"} · {d.createdAt}
                    </p>
                  </div>
                  <span className="text-sm text-sky-300">Mở →</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
