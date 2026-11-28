import { NextRequest } from "next/server";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { readDataset, safeVoiceName, writeDataset, type Segment } from "@/lib/training";

export async function GET(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const voice = req.nextUrl.searchParams.get("voice") || "";
  if (!voice) return fail("Thiếu tên giọng");
  const ds = readDataset(voice);
  if (!ds) return fail("Chưa có dataset của giọng này", 404);
  return ok({ dataset: ds });
}

export async function POST(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  try {
    const body = (await req.json()) as { voice?: string; segments?: Segment[] };
    if (!body.voice || !Array.isArray(body.segments)) return fail("Dữ liệu không hợp lệ");
    const current = readDataset(body.voice);
    if (!current) return fail("Chưa có dataset của giọng này", 404);
    const segments = body.segments.map((s) => ({
      file: String(s.file || ""),
      text: String(s.text || ""),
      duration_ms: Number(s.duration_ms) || 0,
      start_ms: Number(s.start_ms) || 0,
      end_ms: Number(s.end_ms) || 0,
    }));
    const ds = { ...current, voiceName: safeVoiceName(body.voice), segments };
    writeDataset(ds);
    return ok({ dataset: ds });
  } catch (err) {
    return fail((err as Error).message);
  }
}
