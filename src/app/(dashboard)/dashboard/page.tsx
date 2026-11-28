"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, post } from "@/lib/client";
import type { Voice } from "@/lib/types";

type Chunk = { idx: number; text: string; status: "pending" | "running" | "done" | "error"; duration_ms: number };
type Boundary = { idx: number; startMs: number; endMs: number };
type Preset = { voice_id: string; name: string; gender?: string; featured?: boolean };
type TrainedVoice = {
  name: string;
  label: string;
  dryRun: boolean;
  sampleDuration: number;
};
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
  const [presets, setPresets] = useState<Preset[]>([]);
  const [trainedVoices, setTrainedVoices] = useState<TrainedVoice[]>([]);
  const [voiceId, setVoiceId] = useState(0);
  const [trainedVoice, setTrainedVoice] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [audioProgress, setAudioProgress] = useState(0);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const pauseRequestedRef = useRef(false);
  const boundariesRef = useRef<Boundary[]>([]);
  const pausedAtRef = useRef(0);
  const lastSpaceRef = useRef(0);
  const currentSentenceRef = useRef(0);

  useEffect(() => {
    // Khoi phuc kich ban + giong + audio da luu, roi moi load danh sach giong
    api<{ state: { text: string; voiceId: string; jobId: string; trainedVoice?: string } }>("/api/app-state")
      .then((r) => {
        const savedText = r.state.text || "";
        const savedVoiceId = Number(r.state.voiceId) || 0;
        const savedJobId = r.state.jobId || "";
        const savedTrained = r.state.trainedVoice || "";
        if (savedText) setText(savedText);
        if (savedJobId) poll(savedJobId);
        if (savedTrained) setTrainedVoice(savedTrained);
        return savedVoiceId;
      })
      .catch(() => 0)
      .then((savedVoiceId) => {
        api<{ voices: Voice[]; defaultVoiceId?: number; trainedVoices?: TrainedVoice[] }>("/api/voices")
          .then((r) => {
            setVoices(r.voices);
            setTrainedVoices(r.trainedVoices || []);
            if (savedVoiceId && r.voices.some((v) => v.id === savedVoiceId)) {
              setVoiceId(savedVoiceId);
            } else if (r.defaultVoiceId && r.voices.some((v) => v.id === r.defaultVoiceId)) {
              setVoiceId(r.defaultVoiceId);
            } else if (r.voices.length) {
              setVoiceId(r.voices[0].id);
            }
          })
          .catch((e) => setError(e.message));
      });
    api<{ presets: Preset[] }>("/api/voices/presets")
      .then((r) => setPresets(r.presets || []))
      .catch(() => {});

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function chooseVoice(value: string) {
    if (value.startsWith("trained|")) {
      setTrainedVoice(value.slice(8));
      setVoiceId(0);
      setError("");
      return;
    }
    setTrainedVoice("");
    if (value.startsWith("preset|")) {
      const name = value.slice(7);
      try {
        const r = await post<{ voice: Voice }>("/api/voices/use-preset", { name });
        setVoices((prev) =>
          prev.some((v) => v.id === r.voice.id) ? prev : [...prev, r.voice]
        );
        setVoiceId(r.voice.id);
        setError("");
      } catch (err) {
        setError((err as Error).message);
      }
    } else {
      setVoiceId(Number(value));
    }
  }

  function poll(jobId: string) {
    if (timer.current) clearInterval(timer.current);
    const tick = () => {
      api<{ job: Job; chunks: Chunk[]; boundaries: Boundary[] }>(
        `/api/tts?jobId=${encodeURIComponent(jobId)}`
      )
        .then((r) => {
          setJob(r.job);
          setChunks(r.chunks);
          setBoundaries(r.boundaries || []);
          boundariesRef.current = r.boundaries || [];
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
    if (!voiceId && !trainedVoice) return setError("Chọn giọng trong Thư viện giọng");
    setBusy(true);
    setError("");
    setJob(null);
    setChunks([]);
    setBoundaries([]);
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setIsPaused(false);
    setCurrentSentence(0);
    setAudioProgress(0);
    try {
      const res = await post<{ jobId: string; total: number }>("/api/tts", {
        voiceId,
        trainedVoice: trainedVoice || undefined,
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
      // Luu kich ban + giong + job de khoi phuc lan sau
      api("/api/app-state", {
        method: "PUT",
        body: JSON.stringify({
          text: text.trim(),
          voiceId,
          trainedVoice,
          jobId: res.jobId,
        }),
      }).catch(() => {});
      poll(res.jobId);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function createNew() {
    audioEl.current?.pause();
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    await api("/api/app-state", { method: "DELETE" }).catch(() => {});
    setText("");
    setJob(null);
    setChunks([]);
    setBoundaries([]);
    boundariesRef.current = [];
    setPauseRequested(false);
    pauseRequestedRef.current = false;
    setIsPaused(false);
    setCurrentSentence(0);
    setAudioProgress(0);
    setError("");
    setBusy(false);
  }

  const progress = job?.total ? Math.round((job.done / job.total) * 100) : 0;

  function formatTime(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  // Kiem tra moi 100ms: chi dung khi cau hien tai doc xong (khong cat ngang)
  useEffect(() => {
    if (!job || job.status !== "done" || !job.resultUrl) return;
    const check = () => {
      const audio = audioEl.current;
      const bs = boundariesRef.current;
      if (!audio || audio.paused || !bs.length) return;
      const ms = audio.currentTime * 1000;
      setAudioProgress(audio.currentTime);
      // Tim cau co startMs <= ms (ke ca dang o doan nghi sau cau do)
      let idx = -1;
      for (let i = 0; i < bs.length; i++) {
        if (ms >= bs[i].startMs) idx = i;
        else break;
      }
      const safeIdx = idx < 0 ? bs.length - 1 : idx;
      currentSentenceRef.current = safeIdx;
      setCurrentSentence(safeIdx);
      if (pauseRequestedRef.current && (idx < 0 || ms >= bs[safeIdx].endMs - 50)) {
        // Dat state truoc khi pause de onPause khong ghi de isPaused
        pausedAtRef.current = safeIdx;
        currentSentenceRef.current = safeIdx;
        pauseRequestedRef.current = false;
        setPauseRequested(false);
        setIsPaused(true);
        audio.pause();
        audio.blur();
      }
    };
    const id = setInterval(check, 100);
    return () => clearInterval(id);
  }, [job?.status, job?.resultUrl]);

  // Ap dung toc do phat (0.5x - 2x)
  useEffect(() => {
    if (audioEl.current) audioEl.current.playbackRate = speed;
  }, [speed, job?.resultUrl]);

  // Space lan 1: doc het cau hien tai roi dung.
  // Space lan 2: bat dau cau tiep theo tu dau.
  const togglePause = useCallback(() => {
    const audio = audioEl.current;
    const bs = boundariesRef.current;
    if (!audio || !bs.length) return;

    if (!audio.paused) {
      // Dang phat -> yeu cau dung sau khi ket thuc cau hien tai
      pauseRequestedRef.current = true;
      setPauseRequested(true);
      audio.blur();
      return;
    }

    // Dang dung -> chuyen sang cau tiep theo tu dau
    const from = pausedAtRef.current;
    let next = from + 1;
    if (next >= bs.length) {
      // Het danh sach: khong quay dau, dung yen va bao nguoi dung
      setError("Đã đọc hết các câu. Nhấn 'Tạo lại' để phát lại từ đầu.");
      setIsPaused(true);
      return;
    }
    // Tua dung vao DAU cau ke tiep (startMs that cua cau do)
    const startMs = bs[next].startMs;
    audio.currentTime = startMs / 1000 + 0.01; // them 10ms tranh cham vao gap cua cau truoc
    audio.play().then(() => audio.blur()).catch(() => {});
    pausedAtRef.current = next;
    currentSentenceRef.current = next;
    setCurrentSentence(next);
    setIsPaused(false);
    pauseRequestedRef.current = false;
    setPauseRequested(false);
  }, []);

  // Phim Space: nhan 1 lan = doc het cau roi dung; nhan lan 2 = cau ke tu dau
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.repeat) return; // bo qua key-repeat khi giu phim
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName || "";
      // Chi bo qua cac o nhap lieu — KHONG bo qua BUTTON (nut play cua chung ta)
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (!job || job.status !== "done" || !job.resultUrl) return;
      e.preventDefault(); // chan cu ca: browser scroll + native button activation
      const now = Date.now();
      if (now - lastSpaceRef.current < 350) return; // chong double-trigger
      lastSpaceRef.current = now;

      const audio = audioEl.current;
      // Go truc tiep vao nut de tranh onClick cua nut chay them lan nua
      audio?.blur();
      togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job?.status, job?.resultUrl, togglePause]);

  const pauseLabel = isPaused
    ? `▶ Đọc câu ${Math.min(pausedAtRef.current + 2, chunks.length || 1)} từ đầu`
    : pauseRequested
      ? "⏳ Sẽ dừng sau câu này..."
      : `⏸ Dừng sau câu ${currentSentence + 1}`;

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
            <select
              className="select"
              value={trainedVoice ? `trained|${trainedVoice}` : voiceId || ""}
              onChange={(e) => chooseVoice(e.target.value)}
            >
              <option value="">— Chọn giọng —</option>
              {trainedVoices.length > 0 && (
                <optgroup label="Giọng đã train [Custom Fine-tuned]">
                  {trainedVoices.map((v) => (
                    <option key={v.name} value={`trained|${v.name}`}>
                      [Custom Fine-tuned] {v.name}
                      {v.dryRun ? " (dry-run)" : ""}
                      {v.sampleDuration ? ` · mẫu ${v.sampleDuration}s` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {voices.length > 0 && (
                <optgroup label="Giọng đã lưu">
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.provider === "vieneu" ? "VieNeu" : v.provider === "elevenlabs" ? "ElevenLabs" : "Demo"})
                    </option>
                  ))}
                </optgroup>
              )}
              {presets.length > 0 && (
                <optgroup label="Giọng có sẵn — chọn là dùng ngay">
                  {presets.map((p) => (
                    <option key={p.voice_id} value={`preset|${p.name}`}>
                      {p.featured ? "⭐ " : ""}{p.name}{p.gender ? ` (${p.gender})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <Link href="/voices" className="btn-ghost shrink-0">Quản lý giọng</Link>
          </div>
          {!voices.length && !presets.length && (
            <p className="mt-2 text-xs text-amber-400">
              Chưa có giọng. Kiểm tra service VieNeu đang chạy ở cổng 8000.
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
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy} onClick={create}>
            {busy ? "Đang tạo audio..." : "🎙️ Tạo giọng nói"}
          </button>
          <button
            className="btn-ghost shrink-0"
            disabled={busy || !text.trim()}
            onClick={() => {
              audioEl.current?.pause();
              create();
            }}
            title="Tạo lại audio với nội dung và giọng hiện tại"
          >
            🔄 Tạo lại
          </button>
          <button
            className="btn-danger shrink-0"
            onClick={createNew}
            title="Xóa toàn bộ text và audio cũ để bắt đầu cái mới"
          >
            🆕 Tạo mới
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Mỗi lần bấm <b>Tạo giọng nói / Tạo lại</b>, kịch bản và audio được lưu lại tự động. Chỉ bấm <b>Tạo mới</b> khi muốn xóa sạch để làm cái khác.
        </p>
      </div>

      {job && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tiến trình tạo giọng</h2>
            <div className="flex items-center gap-2">
              <span className="badge bg-slate-800 text-slate-300">⏱️ {formatTime(job.durationMs / 1000)}</span>
              <span className={`badge ${job.status === "done" ? "bg-emerald-500/15 text-emerald-300" : job.status === "error" ? "bg-rose-500/15 text-rose-300" : "bg-sky-500/15 text-sky-300"}`}>
                {job.status === "done" ? "Hoàn tất" : job.status === "error" ? "Lỗi" : "Đang chạy"}
              </span>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{job.done} / {job.total} đoạn hoàn thành</span>
              <span>{progress}%</span>
            </div>
            {job.status === "running" && job.done >= job.total - 1 && (
              <p className="mb-2 text-xs text-sky-400">
                ⏳ Đã xử lý xong các đoạn — đang tổng hợp audio thật, vui lòng đợi thêm...
              </p>
            )}
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
            <div className="space-y-4 border-t border-slate-800 pt-4">
              <h3 className="font-semibold">Audio hoàn chỉnh</h3>

              {/* Tong thoi luong voice da tao */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-sky-900/60 bg-sky-950/20 p-3">
                  <p className="text-xs text-sky-400">⏱️ Tổng thời lượng</p>
                  <p className="mt-1 text-2xl font-bold text-sky-200">{formatTime(job.durationMs / 1000)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">📝 Số câu</p>
                  <p className="mt-1 text-2xl font-bold text-slate-200">{chunks.length}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">🔤 Số ký tự</p>
                  <p className="mt-1 text-2xl font-bold text-slate-200">{text.trim().length}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">⚡ Tốc độ</p>
                  <p className="mt-1 text-2xl font-bold text-slate-200">{speed.toFixed(1)}x</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Tổng thời lượng là độ dài audio khi phát ở <b>1.0x</b>. Nếu chưa đủ, hãy bổ sung thêm nội dung rồi bấm <b>Tạo lại</b>.
              </p>



              <button
                className="btn-primary w-full mt-2"
                onClick={() =>
                  window.open(
                    `/karaoke?jobId=${encodeURIComponent(job.id)}`,
                    "_blank",
                    "width=900,height=760,menubar=no,toolbar=no"
                  )
                }
              >
                🪟 Mở Lời Thoại Phát Live
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
