import { NextRequest } from "next/server";
import db, { now } from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { setSetting } from "@/lib/settings";
import { listProviderVoices } from "@/lib/integrations";
import type { Voice } from "@/lib/types";

export async function POST(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const b = (await req.json()) as { name?: string };
  const name = b.name?.trim();
  if (!name) return fail("Chọn một giọng preset");

  const presets = await listProviderVoices();
  const preset = presets.find((p) => p.name === name);
  if (!preset) return fail("Không tìm thấy giọng preset trên service VieNeu", 404);

  let voice = db
    .prepare("SELECT * FROM voices WHERE provider = 'vieneu' AND voice_id = ?")
    .get(preset.voice_id) as unknown as Voice | undefined;
  if (!voice) {
    const info = db
      .prepare(
        `INSERT INTO voices (name, provider, voice_id, sample_path, language, gender, created_at, created_by)
         VALUES (?, 'vieneu', ?, '', 'vi', ?, ?, ?)`
      )
      .run(preset.name, preset.voice_id, preset.gender || "", now(), user.id);
    voice = db.prepare("SELECT * FROM voices WHERE id = ?").get(info.lastInsertRowid) as unknown as Voice;
  }

  setSetting("DEFAULT_VOICE_ID", String(voice.id));
  return ok({ voice, defaultVoiceId: voice.id });
}
