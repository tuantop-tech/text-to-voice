"use client";

import { useEffect, useState } from "react";
import { api, post, put } from "@/lib/client";

type SettingsResp = {
  values: Record<string, string>;
  hasElevenLabs: boolean;
  hasVieNeu: boolean;
  hasLLM: boolean;
  provider: string;
};

const FIELD_LABELS: Record<string, string> = {
  TTS_PROVIDER: "Nhà cung cấp giọng (vieneu | elevenlabs)",
  VIEUNEU_BASE_URL: "VieNeu API base URL",
  VIEUNEU_API_KEY: "VieNeu API key (nếu bật auth)",
  ELEVENLABS_API_KEY: "ElevenLabs API key",
  ELEVENLABS_MODEL_ID: "ElevenLabs model (eleven_multilingual_v2)",
  LLM_API_KEY: "DeepSeek / LLM API key",
  LLM_BASE_URL: "LLM Base URL",
  LLM_MODEL: "LLM Model",
  DANMAKU_WEBHOOK_SECRET: "Webhook secret (để tool ngoài gửi comment)",
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResp | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", displayName: "", role: "operator" });

  async function load() {
    const s = await api<SettingsResp>("/api/settings");
    setData(s);
    setValues(s.values);
    try {
      const me = await api<{ user: { role: string } }>("/api/auth/me");
      setIsAdmin(me.user.role === "admin");
      if (me.user.role === "admin") {
        const u = await api<{ users: any[] }>("/api/users");
        setUsers(u.users);
      }
    } catch {}
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await put<{
        hasElevenLabs: boolean;
        hasVieNeu: boolean;
        hasLLM: boolean;
        provider: string;
      }>("/api/settings", values);
      setData((d) => (d ? { ...d, ...res } : d));
      setNotice("Đã lưu cấu hình.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await post("/api/users", newUser);
      setNewUser({ username: "", password: "", displayName: "", role: "operator" });
      const u = await api<{ users: any[] }>("/api/users");
      setUsers(u.users);
      setNotice("Đã tạo thành viên.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Cài đặt</h1>
        <p className="muted">Cấu hình API, thành viên team và webhook nhận bình luận.</p>
      </header>

      {(notice || error) && (
        <p className={`text-sm ${error ? "text-rose-400" : "text-emerald-400"}`}>{error || notice}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={saveSettings} className="card space-y-4">
          <h2 className="text-lg font-semibold">Khóa API</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`badge ${data?.provider === "vieneu" ? "bg-sky-500/15 text-sky-300" : "bg-slate-700 text-slate-300"}`}>
              Provider: {data?.provider === "vieneu" ? "VieNeu" : "ElevenLabs"}
            </span>
            <span className={`badge ${data?.hasVieNeu ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
              VieNeu: {data?.hasVieNeu ? "Đã cấu hình" : "Chưa có URL"}
            </span>
            <span className={`badge ${data?.hasElevenLabs ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
              ElevenLabs: {data?.hasElevenLabs ? "OK" : "Chưa có key"}
            </span>
            <span className={`badge ${data?.hasLLM ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
              LLM: {data?.hasLLM ? "OK" : "Demo"}
            </span>
          </div>
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <div key={key}>
              <label className="label">{label}</label>
              {key === "TTS_PROVIDER" ? (
                <select
                  className="select"
                  value={values[key] || "elevenlabs"}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                >
                  <option value="vieneu">VieNeu-TTS (local, miễn phí, 25 giọng Việt)</option>
                  <option value="elevenlabs">ElevenLabs (API trả phí)</option>
                </select>
              ) : (
                <input
                  className="input"
                  type={key.includes("KEY") || key.includes("SECRET") ? "password" : "text"}
                  value={values[key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  placeholder={
                    key === "VIEUNEU_BASE_URL"
                      ? "http://127.0.0.1:8000/v1"
                      : key === "LLM_BASE_URL"
                        ? "https://api.deepseek.com"
                        : ""
                  }
                />
              )}
            </div>
          ))}
          <button className="btn-primary">Lưu cấu hình</button>
          <p className="text-xs text-slate-500">
            Key được lưu trong SQLite tại thư mục <code>data/</code>. Không đẩy file này lên git.
          </p>
        </form>

        <div className="space-y-6">
          {isAdmin && (
            <div className="card">
              <h2 className="mb-4 text-lg font-semibold">Thành viên team</h2>
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-xl border border-slate-800 p-3 text-sm">
                    <span>{u.display_name || u.username} <span className="text-slate-500">@{u.username}</span></span>
                    <span className="badge bg-slate-800 text-slate-400">{u.role === "admin" ? "Quản trị" : "Nhân viên"}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={createUser} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input className="input" placeholder="Tài khoản" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                <input className="input" placeholder="Tên hiển thị" value={newUser.displayName} onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })} />
                <input className="input" type="password" placeholder="Mật khẩu (≥6)" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                <select className="select" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option value="operator">Nhân viên</option>
                  <option value="admin">Quản trị</option>
                </select>
                <button className="btn-ghost sm:col-span-2">+ Thêm thành viên</button>
              </form>
            </div>
          )}

          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Kết nối bình luận TikTok / Douyin</h2>
            <p className="muted">
              App thiết kế ở chế độ <b>hỗ trợ</b>: AI gợi ý câu trả lời, bạn duyệt rồi mới đọc. Không tự động đăng bot lên nền tảng.
            </p>
            <p className="muted mt-3">Nếu bạn có tool lấy danmaku riêng, gửi comment về webhook:</p>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-sky-300">{`POST /api/comments?source=webhook
Header: x-webhook-secret: <webhook secret>
Body: { "author": "Khách A", "text": "Giá bao nhiêu?", "source": "douyin" }`}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
