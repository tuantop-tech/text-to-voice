import { cookies } from "next/headers";
import { destroySession, cookieName } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function POST() {
  const store = await cookies();
  destroySession(store.get(cookieName)?.value);
  const res = ok({ done: true });
  res.cookies.set(cookieName, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
