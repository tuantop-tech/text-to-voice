"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, post } from "@/lib/client";
import type { Voice } from "@/lib/types";

type Chunk = { idx: number; text: string; status: "pending" | "running" | "done" | "error"; duration_ms: number };
type Job = {
  id: string;
  status: "running" | "done" | "error";
  total: number;
  done: number;
  currentIndex: number;
  provider: string;
  error: string;
  resultUrl: string | null;
  durationMs: number;
};

export default function TextToVoicePage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api<{ voices: Voice[] }>("/api/voices")
      .then((r) => {
        setVoices(r.voices);
        if (r.voices.length) setVoiceId(r.voices[0].id);
      })
      .catch((e) => setError(e.message));
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function poll(jobId: string) {
    if (timer.current) clearInterval(timer.current);
    const tick = () => {
      api<{ job: Job; chunks: Chunk[] }>(`/api/tts?jobId=${encodeURIComponent(jobId)}`)
        .then((r) => {
          setJob(r.job);
          setChunks(r.chunks);
          if (r.job.status !== "running" && timer.current) {
            clearInterval(timer.current);
            timer.current = null;
            setBusy(false);
          }
        })
        .catch(() => {});
    };
    tick();
    timer.current = setInterval(tick, 1000);
  }

  async function create() {
    if (!text.trim()) return setError("Nhập đoạn văn cần chuyển thành giọng nói");
    if (!voiceId) return setError("Chọn giọng trong Thư viện giọng");
    setBusy(true);
    setError("");
    setJob(null);
    setChunks([]);
    try {
      const res = await post<{ jobId: string; total: number }>("/api/tts", {
        voiceId,
        text: text.trim(),
      });
      setJob({
        id: res.jobId,
        status: "running",
        total: res.total,
        done: 0,
        currentIndex: 0,
        provider: "",
        error: "",
        resultUrl: null,
        durationMs: 0,
      });
      poll(res.jobId);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const progress = job?.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Chuyển văn bản thành giọng nói</h1>
        <p className="muted">Dán đoạn văn, chọn giọng, theo dõi tiến trình từng đoạn rồi nghe hoặc tải audio về.</p>
      </header>

      <div className="card space-y-5">
        <div>
          <label className="label">Giọng nói</label>
          <div className="flex gap-2">
            <select className="select" value={voiceId} onChange={(e) => setVoiceId(Number(e.target.value))}>
              <option value={0}>— Chọn giọng —</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.provider === "vieneu" ? "VieNeu" : v.provider === "elevenlabs" ? "ElevenLabs" : "Demo"})
                </option>
              ))}
            </select>
            <Link href="/voices" className="btn-ghost shrink-0">Quản lý giọng</Link>
          </div>
          {!voices.length && (
            <p className="mt-2 text-xs text-amber-400">
              Chưa có giọng. Vào <Link className="underline" href="/voices">Thư viện giọng</Link> để nhập preset VieNeu.
            </p>
          )}
        </div>

        <div>
          <label className="label">Đoạn văn cần đọc</label>
          <textarea
            className="textarea min-h-48"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dán nội dung bán hàng, lời bình luận, kịch bản ngắn... vào đây."
          />
          <p className="mt-1 text-xs text-slate-500">{text.length} ký tự</p>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy} onClick={create}>
          {busy ? "Đang tạo audio..." : "🎙️ Tạo giọng nói"}
        </button>
      </div>

      {job && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tiến trình tạo giọng</h2>
            <span className={`badge ${job.status === "done" ? "bg-emerald-500/15 text-emerald-300" : job.status === "error" ? "bg-rose-500/15 text-rose-300" : "bg-sky-500/15 text-sky-300"}`}>
              {job.status === "done" ? "Hoàn tất" : job.status === "error" ? "Lỗi" : "Đang chạy"}
            </span>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{job.done} / {job.total} đoạn hoàn thành</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {chunks.map((c) => (
              <div
                key={c.idx}
                className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                  c.status === "running"
                    ? "border-sky-600 bg-sky-500/10"
                    : c.status === "done"
                      ? "border-emerald-900/60 bg-emerald-950/20"
                      : c.status === "error"
                        ? "border-rose-900 bg-rose-950/20"
                        : "border-slate-800 bg-slate-950/40"
                }`}
              >
                <span className="w-6 shrink-0 text-center">
                  {c.status === "done" ? "✅" : c.status === "running" ? "🔵" : c.status === "error" ? "❌" : "⏳"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs text-slate-500">Đoạn {c.idx + 1}</span>
                  <p className="truncate text-slate-300">{c.text}</p>
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {c.status === "done" ? `${Math.round(c.duration_ms / 1000)}s` : c.status === "running" ? "đang tạo" : c.status === "error" ? "lỗi" : "chờ"}
                </span>
              </div>
            ))}
          </div>

          {job.error && <p className="text-sm text-rose-400">{job.error}</p>}

          {job.status === "done" && job.resultUrl && (
            <div className="space-y-3 border-t border-slate-800 pt-4">
              <h3 className="font-semibold">Audio hoàn chỉnh</h3>
              <audio controls className="w-full" src={job.resultUrl} />
              <div className="flex flex-wrap items-center gap-3">
                <a className="btn-ghost" href={job.resultUrl} download="voice.wav">⬇ Tải về</a>
                <span className="text-xs text-slate-500">
                  {job.provider === "vieneu" ? "VieNeu-TTS" : job.provider === "elevenlabs" ? "ElevenLabs" : "Demo (beep)"}
                  {" · "}~{Math.round(job.durationMs / 1000)}s
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
