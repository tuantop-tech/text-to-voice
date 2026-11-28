"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PublicUser } from "@/lib/types";

const links = [
  { href: "/dashboard", icon: "🎙️", label: "Chuyển văn bản" },
  { href: "/voices", icon: "♫", label: "Thư viện giọng" },
  { href: "/training", icon: "🧠", label: "Huấn luyện giọng (Fine-tuning)" },
  { href: "/settings", icon: "⚙", label: "Cài đặt" },
];

export default function Sidebar({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex min-h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60 p-4">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-lg">🎙️</span>
        <span>
          <b className="block text-sm">Text → Voice</b>
          <span className="text-[11px] text-slate-500">Đơn giản, nhanh</span>
        </span>
      </Link>

      <nav className="space-y-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? "bg-sky-500/15 font-medium text-sky-300"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <span className="w-5 text-center">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="truncate text-sm font-medium">{user.display_name || user.username}</p>
          <p className="text-[11px] text-slate-500">{user.role === "admin" ? "Quản trị" : "Thành viên"}</p>
          <button onClick={logout} className="mt-2 text-xs text-rose-400 hover:text-rose-300">
            Đăng xuất
          </button>
        </div>
      </div>
    </aside>
  );
}
