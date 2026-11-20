import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import db from "./db";
import { randomToken, sign } from "./crypto";
import type { PublicUser, User } from "./types";

const COOKIE = "la_session";
const secret = process.env.SESSION_SECRET || "dev-only-secret-change-me";
const MAX_AGE = 60 * 60 * 24 * 7;

function signed(token: string) {
  return `${token}.${sign(token, secret)}`;
}

export function createSession(userId: number): string {
  const token = randomToken();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    Date.now() + MAX_AGE * 1000
  );
  return signed(token);
}

export function destroySession(cookieValue?: string) {
  if (!cookieValue) return;
  const token = cookieValue.split(".")[0];
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (!value) return null;
  const [token, sig] = value.split(".");
  if (!token || sign(token, secret) !== sig) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.display_name FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, Date.now()) as unknown as PublicUser | undefined;
  if (!row) return null;
  // node:sqlite tra object co null-prototype -> phai chuyen sang plain object
  // de Next.js serialize duoc khi truyen xuong Client Component.
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    display_name: row.display_name,
  };
}

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<PublicUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export const cookieName = COOKIE;
export const cookieMaxAge = MAX_AGE;

export function findUserByUsername(username: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as unknown as User | undefined;
}
