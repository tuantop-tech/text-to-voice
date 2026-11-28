import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { paths } from "@/lib/db";
import { uid } from "@/lib/utils";
import {
  metadataFile,
  rawAudioDir,
  safeVoiceName,
  uploadsDir,
  voiceServerBase,
  writeDataset,
} from "@/lib/training";
import "@/lib/integrations"; // timeout 20 phut cho request dai

const ALLOWED = new Set([".wav", ".mp3", ".m4a", ".ogg", ".flac"]);

export async function POST(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  try {
    const form = await req.formData();
    const voiceName = safeVoiceName(String(form.get("voiceName") || ""));
    const model = String(form.get("model") || "base") === "small" ? "small" : "base";
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return fail("Chọn ít nhất 1 file ghi âm (.wav, .mp3)");

    const dir = uploadsDir(voiceName);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(rawAudioDir(voiceName), { recursive: true });
    const saved: string[] = [];
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED.has(ext)) return fail(`Định dạng không hỗ trợ: ${file.name}`);
      const full = path.join(dir, `${uid()}${ext}`);
      fs.writeFileSync(full, Buffer.from(await file.arrayBuffer()));
      saved.push(full);
    }

    const res = await fetch(`${voiceServerBase()}/v1/dataset/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data_dir: paths.dataDir, // ./data tu process.cwd()
        voice_name: voiceName,
        files: saved,
        model,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data.error || "Không cắt/nhận diện được audio", 502);

    writeDataset(data);
    return ok({
      dataset: data,
      metadataPath: path.relative(paths.dataDir, metadataFile(voiceName)),
    });
  } catch (err) {
    return fail((err as Error).message || "Lỗi chuẩn bị dữ liệu");
  }
}
