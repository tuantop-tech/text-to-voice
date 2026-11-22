import { NextRequest } from "next/server";
import db from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";

const KEYS = ["text", "voiceId", "jobId"];

export async function GET() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const rows = db.prepare("SELECT key, value FROM app_state").all() as unknown as {
    key: string;
    value: string;
  }[];
  const state: Record<string, string> = { text: "", voiceId: "0", jobId: "" };
  for (const r of rows) state[r.key] = r.value;
  return ok({ state });
}

export async function PUT(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const b = (await req.json()) as Record<string, unknown>;
  for (const k of KEYS) {
    if (k in b) {
      db.prepare(
        "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).run(k, String(b[k] ?? ""));
    }
  }
  return ok({ done: true });
}

export async function DELETE() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  db.prepare("DELETE FROM app_state").run();
  return ok({ done: true });
}
