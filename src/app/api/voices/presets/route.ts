import db, { now } from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { listProviderVoices, voiceProvider, hasVieNeu } from "@/lib/integrations";
import type { Voice } from "@/lib/types";

export async function GET() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  if (voiceProvider() !== "vieneu" || !hasVieNeu()) {
    return ok({ presets: [], message: "Đổi TTS_PROVIDER sang 'vieneu' trong Cài đặt để lấy giọng preset." });
  }
  return ok({ presets: await listProviderVoices() });
}

export async function POST() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  if (voiceProvider() !== "vieneu" || !hasVieNeu()) {
    return fail("Chưa cấu hình VieNeu-TTS trong Cài đặt", 400);
  }
  const presets = await listProviderVoices();
  if (!presets.length) return fail("Không lấy được danh sách giọng. Kiểm tra service VieNeu có chạy ở VIENEU_BASE_URL không.");

  let added = 0;
  for (const p of presets) {
    const exists = db
      .prepare("SELECT id FROM voices WHERE provider = 'vieneu' AND voice_id = ?")
      .get(p.voice_id);
    if (exists) continue;
    db.prepare(
      `INSERT INTO voices (name, provider, voice_id, sample_path, language, gender, created_at, created_by)
       VALUES (?, 'vieneu', ?, '', 'vi', ?, ?, ?)`
    ).run(p.name, p.voice_id, p.gender || "", now(), user.id);
    added++;
  }
  const voices = db
    .prepare("SELECT * FROM voices ORDER BY id DESC")
    .all() as unknown as Voice[];
  return ok({ added, total: voices.length, voices });
}
