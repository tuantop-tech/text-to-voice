import { NextRequest } from "next/server";
import db, { now } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { hashPassword } from "@/lib/crypto";
import type { User } from "@/lib/types";

export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return fail("Chỉ quản trị viên", 403);
  const users = db
    .prepare("SELECT id, username, role, display_name, created_at FROM users ORDER BY id")
    .all();
  return ok({ users });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") return fail("Chỉ quản trị viên", 403);
  const b = (await req.json()) as { username?: string; password?: string; displayName?: string; role?: string };
  if (!b.username?.trim() || !b.password || b.password.length < 6) {
    return fail("Tài khoản tối thiểu 2 ký tự, mật khẩu 6 ký tự");
  }
  try {
    const info = db
      .prepare(
        "INSERT INTO users (username, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(
        b.username.trim(),
        hashPassword(b.password),
        b.role === "admin" ? "admin" : "operator",
        b.displayName?.trim() || b.username.trim(),
        now()
      );
    const user = db.prepare("SELECT id, username, role, display_name FROM users WHERE id = ?").get(info.lastInsertRowid);
    return ok({ user });
  } catch {
    return fail("Tài khoản đã tồn tại");
  }
}
