"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Chunk = { idx: number; text: string; status: string; duration_ms: number };
type Boundary = { idx: number; startMs: number; endMs: number };
type Job = {
  id: string;
  status: string;
  total: number;
  done: number;
  resultUrl: string | null;
  durationMs: number;
  provider: string;
};

const LOOP_FACTORS = [1, 1.08, 0.94, 1.14, 0.9];

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function KaraokeWindow() {
  const [job, setJob] = useState<Job | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [autoLoop, setAutoLoop] = useState(true);
  const [loop, setLoop] = useState(1);
  const [error, setError] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pauseReqRef = useRef(false);
  const boundsRef = useRef<Boundary[]>([]);
  const pausedAtRef = useRef(0);
  const autoLoopRef = useRef(true);
  const baseSpeedRef = useRef(1);
  const loopRef = useRef(1);
  const urlRef = useRef("");
  const sessionElapsedRef = useRef(0);
  const lastAudioTimeRef = useRef(0);
  const knownDurationRef = useRef(0);
  const loopGuardRef = useRef(false);
  const retryLoadRef = useRef(false);
  const restartLoopRef = useRef<() => void>(() => {});
  const playRetryRef = useRef<(a: HTMLAudioElement, attempt?: number) => void>(() => {});

  // Tao Audio moi cho moi lan bat dau/chuyen vong. Co retry + watchdog de khong bi dung o may khach.
  const startAudio = useCallback((fromSec: number, rate: number) => {
    const url = urlRef.current;
    if (!url) return;
    const old = audioRef.current;
    if (old) {
      old.onended = null;
      old.onplay = null;
      old.onpause = null;
      old.onerror = null;
      try {
        if (!old.ended) old.pause();
      } catch {}
    }
    const a = new Audio(url);
    a.preload = "auto";
    a.playbackRate = rate;
    const start = Math.max(0, fromSec || 0);
    a.currentTime = start;
    lastAudioTimeRef.current = start;
    a.onplay = () => setPlaying(true);
    a.onpause = () => {
      // Luc ket thuc, browser cung fire pause -> khong gan nhan "Da dung" o day
      if (!pauseReqRef.current && !a.ended) setPlaying(false);
    };
    // Su kien chinh khi het doan; watchdog o interval se lo phan coi khong fire su kien nay
    a.onended = () => restartLoopRef.current();
    a.onerror = () => {
      if (audioRef.current !== a || retryLoadRef.current) return;
      retryLoadRef.current = true;
      setError("Lỗi tải audio. Đang thử lại...");
      setTimeout(() => {
        retryLoadRef.current = false;
        if (audioRef.current === a && urlRef.current) startAudio(0, a.playbackRate);
      }, 800);
    };
    audioRef.current = a;
    playRetryRef.current(a, 0);
  }, []);

  // Phat audio, tu retry neu browser tu choi (autoplay policy / audio chua san sang)
  playRetryRef.current = (a: HTMLAudioElement, attempt = 0) => {
    let p: Promise<void> | undefined;
    try {
      p = a.play();
    } catch {
      p = undefined;
    }
    if (!p || typeof p.catch !== "function") return;
    p.catch((e: any) => {
      if (audioRef.current !== a) return;
      if (attempt < 3) {
        setTimeout(() => {
          if (audioRef.current === a) playRetryRef.current(a, attempt + 1);
        }, 300 * (attempt + 1));
      } else {
        setError(`Không thể phát audio (${e?.name || "play error"}). Nhấn ▶ để thử lại.`);
        setPlaying(false);
        fetch("/api/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `play failed after retry: ${e?.name} ${e?.message}` }),
        }).catch(() => {});
      }
    });
  };

  // Chuyen vong moi: tang luot, doi toc do, bat dau lai tu dau
  restartLoopRef.current = () => {
    if (!autoLoopRef.current) {
      setPlaying(false);
      return;
    }
    // Nguoi dung da nhan Space / Pause: dung o cuoi doan, khong tu phat lai
    if (pauseReqRef.current) {
      pauseReqRef.current = false;
      setPauseRequested(false);
      setPlaying(false);
      return;
    }
    const n = loopRef.current + 1;
    loopRef.current = n;
    setLoop(n);
    const factor = LOOP_FACTORS[(n - 1) % LOOP_FACTORS.length];
    const nextRate = Math.min(2, Math.max(0.5, baseSpeedRef.current * factor));
    setSpeed(nextRate);
    setProgress(0);
    setCurrent(0);
    lastAudioTimeRef.current = 0;
    pausedAtRef.current = 0;
    startAudio(0, nextRate);
  };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("jobId") || "";
    if (!id) {
      setError("Thiếu jobId. Hãy mở cửa sổ này từ trang tạo giọng nói.");
      return;
    }
    const load = () =>
      api<{ job: Job; chunks: Chunk[]; boundaries: Boundary[] }>(`/api/tts?jobId=${encodeURIComponent(id)}`);
    load()
      .then((r) => {
        setJob(r.job);
        setChunks(r.chunks);
        setBoundaries(r.boundaries || []);
        boundsRef.current = r.boundaries || [];
        if (r.job.resultUrl) urlRef.current = r.job.resultUrl;
        knownDurationRef.current = (r.job.durationMs || 0) / 1000;
        if (r.job.status !== "done") {
          const t = setInterval(() => {
            load()
              .then((x) => {
                setJob(x.job);
                setChunks(x.chunks);
                if (x.job.resultUrl) urlRef.current = x.job.resultUrl;
                knownDurationRef.current = (x.job.durationMs || 0) / 1000;
                if (x.job.status === "done") {
                  setBoundaries(x.boundaries || []);
                  boundsRef.current = x.boundaries || [];
                  clearInterval(t);
                }
              })
              .catch(() => {});
          }, 1000);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Theo doi audio -> cap nhat cau hien tai, dung lich su cuoi cau
  useEffect(() => {
    const timer = setInterval(() => {
      const a = audioRef.current;
      const bs = boundsRef.current;
      if (!a || !bs.length) return;
      const nowT = a.currentTime;

      // WATCHDOG: mot so may khach khong fire su kien 'ended' -> tu chuyen vong o cuoi file
      // (dat TRUOC check paused vi thoi diem ket thuc a.paused = true)
      // File WAV lon: browser co khi tra duration = Infinity -> dung thoi luong DB lam moc
      const rawDur = a.duration;
      const dur = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : knownDurationRef.current;
      const atEnd =
        a.ended || (dur > 0 && nowT >= dur - 0.35);
      if (atEnd && !loopGuardRef.current && !a.seeking) {
        loopGuardRef.current = true;
        restartLoopRef.current();
        setTimeout(() => {
          loopGuardRef.current = false;
        }, 700);
        return;
      }

      if (a.paused) return;

      // Cong don thoi gian chay cua ca phien (khong reset khi audio quay dau)
      let delta = nowT - lastAudioTimeRef.current;
      if (delta < 0 || delta > 1) delta = 0; // bo qua luc tua/luyen
      sessionElapsedRef.current += delta;
      lastAudioTimeRef.current = nowT;
      setSessionElapsed(sessionElapsedRef.current);
      const ms = nowT * 1000;
      setProgress(nowT);
      let idx = -1;
      for (let i = 0; i < bs.length; i++) {
        if (ms >= bs[i].startMs) idx = i;
        else break;
      }
      const safe = idx < 0 ? 0 : idx;
      setCurrent(safe);
      if (pauseReqRef.current && (idx < 0 || ms >= bs[safe].endMs - 50)) {
        pausedAtRef.current = safe;
        pauseReqRef.current = false;
        setPauseRequested(false);
        setPlaying(false);
        a.pause();
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (a && a.paused) {
      a.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    autoLoopRef.current = autoLoop;
  }, [autoLoop]);

  // Tu dong cuon cau dang doc vao CHINH GIUA khung hien thi
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const active = activeRef.current;
      if (!list || !active) return;
      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      // Vi tri cua active tinh theo noi dung dang cuon cua list
      const target =
        list.scrollTop + (activeRect.top - listRect.top) - (listRect.height - activeRect.height) / 2;
      list.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [current, chunks.length]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    const bs = boundsRef.current;
    if (!a || !bs.length) return;
    if (!a.paused) {
      pauseReqRef.current = true;
      setPauseRequested(true);
      setPlaying(false);
      return;
    }
    const next = pausedAtRef.current + 1;
    if (next >= bs.length) {
      setError("Đã đọc hết các câu.");
      return;
    }
    startAudio(bs[next].startMs / 1000 + 0.01, a.playbackRate);
    pausedAtRef.current = next;
    setCurrent(next);
    setPlaying(true);
    pauseReqRef.current = false;
    setPauseRequested(false);
    setError("");
  }, [startAudio]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName || "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-slate-100">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🎤 Lời Thoại Phát Live</h1>
          <p className="text-xs text-slate-500">
            {job ? `${job.provider} · ${fmt(job.durationMs / 1000)}` : "Đang tải..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pauseRequested && !playing && <span className="badge bg-sky-500/15 text-sky-300">⏳ Dừng sau câu này</span>}
          {!playing && !pauseRequested && job?.resultUrl && <span className="badge bg-amber-500/15 text-amber-300">⏸ Đã dừng</span>}
          {playing && <span className="badge bg-emerald-500/15 text-emerald-300">▶ Đang đọc</span>}
        </div>
      </header>

      {/* Thoi gian chay / con lai */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-sky-900/60 bg-sky-950/20 p-3">
          <p className="text-xs text-sky-400">⏱️ Đã chạy (cả phiên)</p>
          <p className="mt-1 text-2xl font-bold text-sky-200">{fmt(sessionElapsed)}</p>
        </div>
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3">
          <p className="text-xs text-emerald-400">⏳ Còn lại</p>
          <p className="mt-1 text-2xl font-bold text-emerald-200">
            {fmt(Math.max(0, (job?.durationMs ? job.durationMs / 1000 : 0) - progress))}
          </p>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-rose-950/40 p-2 text-sm text-rose-300">{error}</p>}
      {job?.provider === "mock" && (
        <p className="mb-3 rounded-lg bg-amber-950/40 p-2 text-sm text-amber-300">
          ⚠️ Audio này là bản demo (tiếng beep). Hãy bấm <b>Tạo lại</b> ở trang tạo giọng.
        </p>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div ref={listRef} className="max-h-[55vh] space-y-2 overflow-y-auto pr-1 text-2xl leading-relaxed">
          {chunks.map((c, i) => (
            <p
              key={c.idx}
              ref={i === current ? activeRef : undefined}
              className={`rounded-lg px-3 py-1.5 transition-all ${
                i === current
                  ? "bg-sky-500/20 font-bold text-sky-100 shadow-[0_0_25px_rgba(56,189,248,0.3)]"
                  : i < current
                    ? "text-slate-600"
                    : "text-slate-400"
              }`}
            >
              {i === current && <span className="mr-2">▶</span>}
              {c.text}
            </p>
          ))}
          {!chunks.length && <p className="text-base text-slate-500">Chưa có lời thoại.</p>}
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center gap-3">
          <button
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xl text-white hover:bg-sky-400"
            onClick={() => {
              const a = audioRef.current;
              if (!a) {
                if (job?.resultUrl && chunks.length) {
                  urlRef.current = job.resultUrl;
                  startAudio(0, speed);
                }
                return;
              }
              if (a.paused) startAudio(a.currentTime, speed);
              else toggle();
            }}
            disabled={!job?.resultUrl}
          >
            {playing ? "⏸" : pauseRequested ? "⏳" : "▶"}
          </button>
          <div className="flex-1">
            <input
              type="range"
              min="0"
              max={Math.max(1, job?.durationMs ? job.durationMs / 1000 : 1)}
              step="0.1"
              value={progress}
              onChange={(e) => {
                const a = audioRef.current;
                if (a) {
                  a.currentTime = Number(e.target.value);
                  lastAudioTimeRef.current = Number(e.target.value);
                  setProgress(Number(e.target.value));
                }
              }}
              className="h-2 w-full cursor-pointer accent-sky-500"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>▶ Đã chạy <b className="text-sky-300">{fmt(sessionElapsed)}</b></span>
              <span>⏳ Còn lại <b className="text-emerald-300">{fmt(Math.max(0, (job?.durationMs ? job.durationMs / 1000 : 0) - progress))}</b></span>
              <span>Tổng {fmt(job?.durationMs ? job.durationMs / 1000 : 0)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-300">⚡ Tốc độ</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              baseSpeedRef.current = v;
              const a = audioRef.current;
              if (a) {
                a.playbackRate = v;
              }
            }}
            className="h-2 w-40 cursor-pointer accent-sky-500"
          />
          <span className="w-12 text-sm font-medium text-sky-300">{speed.toFixed(1)}x</span>
          <div className="flex gap-1">
            {[0.75, 1, 1.25, 1.5].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSpeed(s);
                  baseSpeedRef.current = s;
                  const a = audioRef.current;
                  if (a) {
                    a.playbackRate = s;
                  }
                }}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  speed === s ? "border-sky-500 bg-sky-500/15 text-sky-300" : "border-slate-700 text-slate-400"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={autoLoop}
              onChange={(e) => setAutoLoop(e.target.checked)}
              className="h-4 w-4 accent-sky-500"
            />
            🔁 Đọc lại từ đầu khi hết đoạn
          </label>
          <span className="badge bg-slate-800 text-slate-300">Lượt {loop}</span>
          <span className="badge bg-slate-800 text-slate-300">⚡ {speed.toFixed(2)}x</span>
        </div>

        <p className="text-xs text-slate-500">
          Mỗi lượt đọc lại tự đổi <b>tốc độ</b> (giọng không bị méo). Nhấn <b>Space</b>: đọc hết câu hiện tại rồi dừng → nhấn lại: câu kế tiếp từ đầu.
        </p>
      </div>
    </main>
  );
}
