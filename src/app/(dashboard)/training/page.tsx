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

export default function TrainingPage() {
  const [tab, setTab] = useState<"new" | "saved">("new");
  const [voiceName, setVoiceName] = useState("");
  const [model, setModel] = useState("base");
  const [files, setFiles] = useState<File[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
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
          <code>pip install -r vieneu-server/requirements-training.txt</code>
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
            <label className="block">
              <span className="text-xs text-slate-400">File ghi âm dài (.wav, .mp3)</span>
              <input
                type="file"
                multiple
                accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="mt-1 w-full text-sm text-slate-300"
              />
              {files.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Đã chọn {files.length} file.</p>
              )}
            </label>
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
