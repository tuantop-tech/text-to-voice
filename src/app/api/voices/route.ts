import { NextRequest } from "next/server";
import db, { now } from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/settings";
import { saveUpload } from "@/lib/utils";
import { cloneVoice, hasElevenLabs, hasVieNeu, voiceProvider } from "@/lib/integrations";
import { listTrainedVoices } from "@/lib/training";
import type { Voice } from "@/lib/types";

export async function GET() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const rows = db.prepare("SELECT * FROM voices ORDER BY id DESC").all() as unknown as Voice[];
  return ok({
    voices: rows,
    hasElevenLabs: hasElevenLabs(),
    hasVieNeu: hasVieNeu(),
    provider: voiceProvider(),
    defaultVoiceId: Number(getSetting("DEFAULT_VOICE_ID", "0")) || 0,
    trainedVoices: listTrainedVoices(),
  });
}

export async function POST(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  try {
    const form = await req.formData();
    let name = String(form.get("name") || "").trim();
    const language = String(form.get("language") || "vi").trim();
    const gender = String(form.get("gender") || "").trim();
    const provider = String(form.get("provider") || voiceProvider()).trim() as
      | "elevenlabs"
      | "vieneu";
    const preset = String(form.get("preset") || "").trim();
    const sample = form.get("sample");

    let samplePath = "";
    let voiceId = "";
    if (provider === "vieneu" && preset && !(sample instanceof File)) {
      // Dung giong preset co san cua VieNeu — khong can upload audio
      voiceId = preset;
      name = name || preset;
    } else {
      if (!name) return fail("Nhập tên giọng");
      if (!(sample instanceof File)) return fail("Chọn file mẫu giọng (wav/mp3)");
      if (sample.size < 1000) return fail("File mẫu quá nhỏ");
      samplePath = await saveUpload(sample, "samples");
      voiceId = await cloneVoice(samplePath, name);
    }

    const resolvedProvider = voiceId.startsWith("mock_")
      ? "mock"
      : provider === "vieneu" && hasVieNeu()
        ? "vieneu"
        : provider === "elevenlabs" && hasElevenLabs()
          ? "elevenlabs"
          : "mock";

    const info = db
      .prepare(
        `INSERT INTO voices (name, provider, voice_id, sample_path, language, gender, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, resolvedProvider, voiceId, samplePath, language, gender, now(), user.id);
    const row = db.prepare("SELECT * FROM voices WHERE id = ?").get(info.lastInsertRowid) as unknown as Voice;
    return ok({ voice: row });
  } catch (err) {
    return fail(`Lỗi tạo giọng: ${(err as Error).message}`);
  }
}
