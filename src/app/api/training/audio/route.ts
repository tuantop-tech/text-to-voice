import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { authOr401, isResponse } from "@/lib/api";
import { rawAudioDir, safeVoiceName } from "@/lib/training";

export async function GET(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const voice = req.nextUrl.searchParams.get("voice") || "";
  const file = req.nextUrl.searchParams.get("file") || "";
  if (!voice || !/^clip_\d+\.wav$/.test(file)) {
    return new Response("Bad request", { status: 400 });
  }
  const full = path.join(rawAudioDir(safeVoiceName(voice)), file);
  if (!fs.existsSync(full)) return new Response("Not found", { status: 404 });
  const buf = fs.readFileSync(full);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
  });
}
