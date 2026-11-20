import fs from "node:fs";
import path from "node:path";
import { paths } from "./db";

export function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[。！？!?.;；\n])/);
  const out: string[] = [];
  for (const line of raw) {
    let s = line.trim();
    if (!s) continue;
    // Bo tieu de markdown / dong ke / nhan vat — khong doc len audio
    if (/^#{1,6}\s/.test(s) || /^---+$/.test(s) || /^[=▬]{3,}$/.test(s)) continue;
    s = s.replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").replace(/^[_`]+|[_`]+$/g, "").trim();
    if (s.length < 8) continue;
    if (/^(Nhân viên|Khách hàng|Người dẫn chương trình|Khách)\s*[:：]?$/i.test(s)) continue;
    out.push(s);
  }
  return out;
}

export function fillVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key: string) => vars[key.trim()] ?? `{{${key}}}`);
}

export async function saveUpload(file: File, subdir: "samples" | "audio"): Promise<string> {
  const ext = path.extname(file.name) || ".bin";
  const name = `${uid()}${ext}`;
  const dest = path.join(subdir === "samples" ? paths.sampleDir : paths.audioDir, name);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  return dest;
}

/** WAV beep dùng cho chế độ demo khi chưa cấu hình ElevenLabs */
export function makeBeepWav(durationMs = 700): Buffer {
  const rate = 24000;
  const samples = Math.floor((durationMs / 1000) * rate);
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t * 30) * Math.min(1, ((durationMs / 1000) - t) * 30);
    const value = Math.sin(2 * Math.PI * 440 * t) * 0.25 * envelope;
    buf.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buf;
}
