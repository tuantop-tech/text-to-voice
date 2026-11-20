import { NextRequest } from "next/server";
import db, { now } from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { synthesize } from "@/lib/integrations";
import { saveAudio, concatWavs } from "@/lib/audio";
import { uid } from "@/lib/utils";
import type { Voice } from "@/lib/types";

type Piece = { buffer: Buffer; ext: "mp3" | "wav"; provider: string; ms: number };

const piecesStore = globalThis as unknown as { __ttsPieces?: Map<string, Piece[]> };
if (!piecesStore.__ttsPieces) piecesStore.__ttsPieces = new Map();
const pieces = piecesStore.__ttsPieces;

// Chi cat dung ranh gioi cau — KHONG BAO GIO cat giua cau.
function chunkText(text: string, max = 300): string[] {
  const sentences = text
    .split(/(?<=[.!?…。！？\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) return [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      const words = s.split(/\s+/);
      let part = "";
      for (const w of words) {
        if (!part) part = w;
        else if ((part + " " + w).length <= max) part += " " + w;
        else {
          out.push(part);
          part = w;
        }
      }
      if (part) out.push(part);
    } else if (!cur || (cur + " " + s).length <= max) {
      cur = cur ? `${cur} ${s}` : s;
    } else {
      out.push(cur);
      cur = s;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function runJob(jobId: string, voice: Voice, chunks: string[]) {
  const collected: Piece[] = [];
  pieces.set(jobId, collected);
  try {
    for (let i = 0; i < chunks.length; i++) {
      db.prepare("UPDATE tts_jobs SET current_index = ? WHERE id = ?").run(i, jobId);
      db.prepare("UPDATE tts_job_chunks SET status = 'running' WHERE job_id = ? AND idx = ?").run(jobId, i);
      try {
        const r = await synthesize(chunks[i], voice);
        collected.push({ buffer: r.buffer, ext: r.ext, provider: r.provider, ms: r.durationMs });
        db.prepare(
          "UPDATE tts_job_chunks SET status = 'done', duration_ms = ? WHERE job_id = ? AND idx = ?"
        ).run(r.durationMs, jobId, i);
        db.prepare("UPDATE tts_jobs SET done = ? WHERE id = ?").run(i + 1, jobId);
      } catch (err) {
        db.prepare("UPDATE tts_job_chunks SET status = 'error' WHERE job_id = ? AND idx = ?").run(jobId, i);
        throw err;
      }
    }

    const allWav = collected.every((p) => p.ext === "wav");
    const buffer = allWav
      ? concatWavs(collected.map((p) => p.buffer))
      : Buffer.concat(collected.map((p) => p.buffer));
    const ext: "mp3" | "wav" = allWav ? "wav" : "mp3";
    const provider = collected.some((p) => p.provider === "vieneu")
      ? "vieneu"
      : collected.some((p) => p.provider === "elevenlabs")
        ? "elevenlabs"
        : "mock";
    const estimated = collected.reduce((n, p) => n + p.ms, 0);
    const durationMs =
      ext === "wav" && buffer.length >= 44
        ? Math.round((buffer.readUInt32LE(40) / (buffer.readUInt32LE(24) * 2)) * 1000)
        : estimated;

    const filePath = saveAudio(buffer, ext);
    const info = db
      .prepare(
        `INSERT INTO audio_items (text, voice_id, file_path, duration_ms, status, source, session_id, created_at)
         VALUES (?, ?, ?, ?, 'done', 'script', NULL, ?)`
      )
      .run("", voice.id, filePath, durationMs, now());
    const audioId = Number(info.lastInsertRowid);
    db.prepare(
      "UPDATE tts_jobs SET status = 'done', result_audio_id = ?, duration_ms = ?, provider = ?, finished_at = ? WHERE id = ?"
    ).run(audioId, durationMs, provider, now(), jobId);
  } catch (err) {
    db.prepare("UPDATE tts_jobs SET status = 'error', error = ?, finished_at = ? WHERE id = ?").run(
      (err as Error).message,
      now(),
      jobId
    );
  } finally {
    pieces.delete(jobId);
  }
}

export async function POST(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;

  const b = (await req.json()) as { voiceId?: number; text?: string };
  const text = b.text?.trim();
  if (!text) return fail("Nhập đoạn văn cần chuyển thành giọng nói");

  const voice = db.prepare("SELECT * FROM voices WHERE id = ?").get(b.voiceId || 0) as unknown as
    | Voice
    | undefined;
  if (!voice) return fail("Chọn giọng nói trước");

  const chunks = chunkText(text);
  const jobId = uid();
  db.prepare(
    `INSERT INTO tts_jobs (id, status, total, done, current_index, voice_id, text, created_at)
     VALUES (?, 'running', ?, 0, -1, ?, ?, ?)`
  ).run(jobId, chunks.length, voice.id, text, now());
  const insertChunk = db.prepare(
    "INSERT INTO tts_job_chunks (job_id, idx, text, status) VALUES (?, ?, ?, 'pending')"
  );
  chunks.forEach((c, i) => insertChunk.run(jobId, i, c));

  // Chay ngam — client se poll GET de xem tien trinh
  void runJob(jobId, voice, chunks);
  return ok({ jobId, total: chunks.length });
}

export async function GET(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return fail("Thiếu jobId");

  const job = db.prepare("SELECT * FROM tts_jobs WHERE id = ?").get(jobId) as unknown as
    | Record<string, any>
    | undefined;
  if (!job) return fail("Không tìm thấy job", 404);
  const chunks = db
    .prepare("SELECT idx, text, status, duration_ms FROM tts_job_chunks WHERE job_id = ? ORDER BY idx")
    .all(jobId) as unknown as { idx: number; text: string; status: string; duration_ms: number }[];

  return ok({
    job: {
      id: job.id,
      status: job.status,
      total: job.total,
      done: job.done,
      currentIndex: job.current_index,
      provider: job.provider,
      error: job.error,
      resultUrl: job.result_audio_id ? `/api/audio/${job.result_audio_id}` : null,
      durationMs: job.duration_ms || chunks.reduce((n, c) => n + (c.duration_ms || 0), 0),
    },
    chunks,
  });
}
