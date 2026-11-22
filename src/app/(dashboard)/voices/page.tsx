"use client";

import { useEffect, useState } from "react";
import { api, del, post } from "@/lib/client";
import type { Voice } from "@/lib/types";

type VoiceResp = {
  voices: Voice[];
  hasElevenLabs: boolean;
  hasVieNeu: boolean;
  provider: string;
  defaultVoiceId: number;
};
type Preset = { voice_id: string; name: string; gender?: string; featured?: boolean };

export default function VoicesPage() {
  const [data, setData] = useState<VoiceResp | null>(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("vi");
  const [gender, setGender] = useState("Nữ");
  const [sample, setSample] = useState<File | null>(null);
  const [provider, setProvider] = useState("vieneu");
  const [preset, setPreset] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [defaultVoiceId, setDefaultVoiceId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => api<VoiceResp>("/api/voices").then((r) => {
    setData(r);
    if (r.provider) setProvider(r.provider);
    setDefaultVoiceId(r.defaultVoiceId || 0);
  }).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    loadPresets();
  }, []);

  async function loadPresets() {
    try {
      const r = await api<{ presets: Preset[] }>("/api/voices/presets");
      setPresets(r.presets);
    } catch {
      setPresets([]);
    }
  }

  async function selectPreset() {
    if (!preset) return setError("Chọn một giọng preset trước");
    setBusy(true);
    setError("");
    try {
      const r = await post<{ voice: Voice; defaultVoiceId: number }>("/api/voices/use-preset", {
        name: preset,
      });
      setDefaultVoiceId(r.defaultVoiceId);
      setNotice(`Đã chọn "${r.voice.name}" làm giọng mặc định. Dùng ngay ở trang Chuyển văn bản.`);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importAll() {
    setBusy(true);
    setError("");
    try {
      const r = await post<{ added: number }>("/api/voices/presets", {});
      setNotice(`Đã nhập ${r.added} giọng preset từ VieNeu.`);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const usePreset = provider === "vieneu" && Boolean(preset);
    if (!usePreset && !sample) return setError("Chọn giọng preset hoặc upload file mẫu");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("language", language);
      form.append("gender", gender);
      form.append("provider", provider);
      if (usePreset) form.append("preset", preset);
      if (sample) form.append("sample", sample);
      await api("/api/voices", { method: "POST", body: form });
      setName("");
      setSample(null);
      setPreset("");
      setNotice("Đã tạo giọng.");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function preview(voice: Voice) {
    setError("");
    try {
      const res = await post<{ items: { id: number }[] }>("/api/tts", {
        voiceId: voice.id,
        text: "Xin chào, mình là trợ lý livestream. Hôm nay bên mình có nhiều ưu đãi rất tốt cho các bạn nha.",
        preview: true,
      });
      const audio = new Audio(`/api/audio/${res.items[0].id}`);
      await audio.play();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(voice: Voice) {
    if (!confirm(`Xóa giọng "${voice.name}"?`)) return;
    await del(`/api/voices/${voice.id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Thư viện giọng</h1>
        <p className="muted">Clone giọng từ audio mẫu để dùng làm AI主播 đọc kịch bản.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Danh sách giọng ({data?.voices.length ?? 0})</h2>
          {!data?.voices.length ? (
            <p className="muted">Chưa có giọng nào. Tạo giọng mới ở form bên cạnh.</p>
          ) : (
            <div className="space-y-3">
              {data.voices.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">♫</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {v.name}
                      {v.id === defaultVoiceId && (
                        <span className="badge ml-2 bg-sky-500/15 text-sky-300">Mặc định</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {v.language.toUpperCase()} · {v.gender || "—"} ·{" "}
                      <span className={v.provider === "mock" ? "text-amber-400" : "text-emerald-400"}>
                        {v.provider === "elevenlabs" ? "ElevenLabs" : v.provider === "vieneu" ? "VieNeu" : "Demo"}
                      </span>
                    </p>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={() => preview(v)}>Nghe thử</button>
                  <button className="btn-danger btn-sm" onClick={() => remove(v)}>Xóa</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card h-fit">
          <h2 className="mb-4 text-lg font-semibold">Tạo giọng mới</h2>
          {provider === "vieneu" && !data?.hasVieNeu && (
            <p className="mb-4 rounded-xl border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
              Chưa kết nối dịch vụ VieNeu. Chạy API server (Docker hoặc Python) ở{" "}
              <code>http://127.0.0.1:8000/v1</code>, hoặc đổi provider sang ElevenLabs trong Cài đặt.
            </p>
          )}
          {provider === "elevenlabs" && !data?.hasElevenLabs && (
            <p className="mb-4 rounded-xl border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
              Chưa có ElevenLabs API key → giọng tạo ở chế độ demo. Dán key tại Cài đặt.
            </p>
          )}
          <form onSubmit={create} className="space-y-4">
            <div>
              <label className="label">Nhà cung cấp giọng</label>
              <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="vieneu">VieNeu-TTS (local, preset có sẵn)</option>
                <option value="elevenlabs">ElevenLabs (cần API key)</option>
              </select>
            </div>
            {provider === "vieneu" && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <label className="label mb-0">Giọng preset VieNeu ({presets.length})</label>
                  {presets.length > 0 && (
                    <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={importAll}>
                      Nhập tất cả
                    </button>
                  )}
                </div>
                {presets.length ? (
                  <select className="select" value={preset} onChange={(e) => setPreset(e.target.value)}>
                    <option value="">— Chọn giọng preset —</option>
                    {presets.map((p) => (
                      <option key={p.voice_id} value={p.voice_id}>
                        {p.featured ? "⭐ " : ""}{p.name}{p.gender ? ` (${p.gender})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-500">Chưa lấy được preset — kiểm tra service VieNeu đang chạy.</p>
                )}
                {presets.length > 0 && (
                  <button
                    type="button"
                    className="btn-primary btn-sm mt-2 w-full"
                    disabled={busy || !preset}
                    onClick={selectPreset}
                  >
                    ✅ Chọn làm giọng mặc định (dùng ngay, không cần tạo)
                  </button>
                )}
                <p className="mt-2 text-xs text-slate-500">Chọn preset thì không cần upload audio mẫu.</p>
              </div>
            )}
            <div>
              <label className="label">Tên giọng</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Giọng Mai - bán hàng" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Ngôn ngữ</label>
                <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="zh">Tiếng Trung</option>
                  <option value="en">Tiếng Anh</option>
                </select>
              </div>
              <div>
                <label className="label">Giới tính</label>
                <select className="select" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option>Nữ</option>
                  <option>Nam</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">
                Audio mẫu (wav / mp3){provider === "vieneu" ? " — 3–8 giây" : " — 30–60 giây"}
                {provider === "vieneu" && preset ? " (không bắt buộc)" : ""}
              </label>
              <input
                className="input"
                type="file"
                accept="audio/*"
                onChange={(e) => setSample(e.target.files?.[0] || null)}
              />
              <p className="mt-1 text-xs text-slate-500">Nên dùng audio sạch, không nhạc nền, một người nói.</p>
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            {notice && <p className="text-sm text-emerald-400">{notice}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Đang xử lý..." : "Tạo giọng"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
