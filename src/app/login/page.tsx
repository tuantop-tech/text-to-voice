"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await post("/api/auth/login", { username, password });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-2xl">
            🎙️
          </div>
          <h1 className="text-2xl font-bold">Livestream AI</h1>
          <p className="muted mt-1">Trợ lý giọng nói cho bán hàng livestream</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">Tài khoản</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Mật khẩu</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mặc định: admin123"
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
          <p className="text-center text-xs text-slate-500">
            Tài khoản khởi tạo: <b>admin</b> / <b>admin123</b>
          </p>
        </form>
      </div>
    </main>
  );
}
