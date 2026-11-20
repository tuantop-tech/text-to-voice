import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { paths } from "@/lib/db";
import { ok } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as { message?: string; stack?: string; url?: string };
    const line = `[${new Date().toISOString()}] ${b.url || ""} :: ${b.message || ""}\n${(b.stack || "").slice(0, 2000)}\n`;
    fs.appendFileSync(path.join(paths.dataDir, "client-errors.log"), line);
  } catch {
    // Khong de logger lam hong app
  }
  return ok({ done: true });
}
