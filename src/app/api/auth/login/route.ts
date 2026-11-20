import { NextRequest } from "next/server";
import db from "@/lib/db";
import { findUserByUsername, createSession, cookieName, cookieMaxAge } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { ok, fail } from "@/lib/api";

export async function POST(req: NextRequest) {
  const { username, password } = (await req.json()) as { username?: string; password?: string };
  if (!username || !password) return fail("Nhập tài khoản và mật khẩu");
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return fail("Sai tài khoản hoặc mật khẩu", 401);
  }
  const token = createSession(user.id);
  const res = ok({
    user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
  });
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });
  return res;
}
