import fs from "node:fs";
import path from "node:path";
import { paths } from "./db";
import { uid } from "./utils";

export function saveAudio(buffer: Buffer, ext: "mp3" | "wav"): string {
  const name = `${uid()}.${ext}`;
  const full = path.join(paths.audioDir, name);
  fs.writeFileSync(full, buffer);
  return full;
}

export function contentTypeFor(filePath: string): string {
  return filePath.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
}

export const WAV_GAP_MS = 120;

/** Tao WAV im lang (su dung khi gap ky hieu nghi [0.3] trong text) */
export function makeSilenceWav(ms: number, rate = 48000): Buffer {
  const samples = Math.max(0, Math.round((Math.max(0, ms) / 1000) * rate));
  const data = Buffer.alloc(samples * 2);
  const out = Buffer.alloc(44 + data.length);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + data.length, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(data.length, 40);
  data.copy(out, 44);
  return out;
}

/** Ghep nhieu WAV 48kHz mono 16-bit thanh mot file (bo header trung gian) */
export function concatWavs(buffers: Buffer[], gapMs = WAV_GAP_MS): Buffer {
  if (!buffers.length) return Buffer.alloc(0);
  const parts = buffers.map((b) => {
    if (b.toString("ascii", 0, 4) !== "RIFF") throw new Error("Khong phai file WAV");
    let pos = 12;
    while (pos + 8 <= b.length) {
      const id = b.toString("ascii", pos, pos + 4);
      const size = b.readUInt32LE(pos + 4);
      if (id === "data") return b.subarray(pos + 8, Math.min(b.length, pos + 8 + size));
      pos += 8 + size + (size % 2);
    }
    throw new Error("Khong tim thay chunk data trong WAV");
  });
  const rate = buffers[0].readUInt32LE(24);
  // Chen doan im lang ngan giua cac cau de ghep tu nhien hon
  const gap = Buffer.alloc(Math.round((gapMs / 1000) * rate * 2));
  const pieces: Buffer[] = [];
  parts.forEach((p, i) => {
    if (i > 0) pieces.push(gap);
    pieces.push(p);
  });
  const total = pieces.reduce((n, p) => n + p.length, 0);
  const out = Buffer.alloc(44 + total);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + total, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(total, 40);
  let offset = 44;
  for (const p of pieces) {
    p.copy(out, offset);
    offset += p.length;
  }
  return out;
}
