import { NextRequest } from "next/server";
import db, { now } from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { synthesize } from "@/lib/integrations";
import { concatWavs, makeSilenceWav, saveAudio, WAV_GAP_MS } from "@/lib/audio";
import { uid } from "@/lib/utils";
import type { Voice } from "@/lib/types";



// Chi cat dung ranh gioi cau — KHONG BAO GIO cat giua cau.
function chunkText(text: string, max = 300): string[] {
  // Chi cat sau dau cau MA co khoang trong / het dong.
  // Khong cat dau cham nam giua chu so ([0.3], 300.000, 1.5...)
  const sentences = text
    .split(/\n+/)
    .flatMap((p) => p.split(/(?<=[.!?…。！？])(?=\s|$)/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) return [text];
  const out: string[] = [];
  for (const s of sentences) {
    if (s.length <= max) {
      out.push(s);
      continue;
    }
    // Cau qua dai: chi tach o ranh gioi tu, van coi la nhieu moc dung
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
  }
  return out;
}

// Tach ky hieu nghi [0.3] -> thoi gian im lang, khong cho TTS doc chu "[0.3]"
function extractPauses(text: string): { text: string; pauses: number[] } {
  const pauses: number[] = [];
  const clean = text
    .replace(/\[(\d+(?:\.\d+)?)\]/g, (_m, n) => {
      pauses.push(Math.round(Number(n) * 1000));
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text: clean, pauses };
}

// 300.000 -> 300000 de TTS khong doc thanh "ba tram khong khong khong"
function normalizeNumbers(text: string) {
  return text.replace(/\.(?=(\d{3})+(?!\d))/g, "");
}

// Gom cac cau thanh nhom ngan de moi request VieNeu khong chay qua lau (tranh timeout 20 phut)
const MAX_BATCH_CHARS = 120;
function makeBatches(chunks: string[]) {
  const batches: { indices: number[]; text: string }[] = [];
  let cur: { indices: number[]; text: string } | null = null;
  chunks.forEach((c, i) => {
    if (!cur || cur.text.length + c.length + 1 > MAX_BATCH_CHARS) {
      if (cur) batches.push(cur);
      cur = { indices: [], text: "" };
    }
    cur.indices.push(i);
    cur.text += (cur.text ? " " : "") + c;
  });
  if (cur) batches.push(cur);
  return batches;
}

function wavDurationMs(buf: Buffer) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return 0;
  const byteRate = buf.readUInt32LE(28);
  if (!byteRate) return 0;
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "data") return Math.round((size / byteRate) * 1000);
    pos += 8 + size + (size % 2);
  }
  return 0;
}

async function runJob(jobId: string, voice: Voice, chunks: string[], fullText: string) {
  try {
    // Dat time luong uoc luong ngay tu dau de UI khong hien 00:00 / 0s
    const estimatedAudioMs = Math.max(1000, Math.round((fullText.length / 18) * 1000));
    db.prepare("UPDATE tts_jobs SET duration_ms = ? WHERE id = ?").run(estimatedAudioMs, jobId);

    // Thay vi 1 request cho TOAN BO doan (de timeout 20 phut), chia thanh nhieu request ngan.
    const batches = makeBatches(chunks);
    const results: { buffer: Buffer; ext: "mp3" | "wav"; provider: "elevenlabs" | "vieneu" | "mock" }[] = [];

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      batch.indices.forEach((i) =>
        db.prepare("UPDATE tts_job_chunks SET status = 'running' WHERE job_id = ? AND idx = ?").run(jobId, i)
      );
      db.prepare("UPDATE tts_jobs SET current_index = ? WHERE id = ?").run(batch.indices[0], jobId);

      const { text: cleanText, pauses } = extractPauses(batch.text);
      const ttsText = normalizeNumbers(cleanText);
      let r = ttsText ? await synthesize(ttsText, voice) : null;
      // That bai -> thu lai 1 lan truoc khi bao loi that (khong tra audio beep)
      if (r && r.provider === "mock" && voice.provider === "vieneu") {
        await new Promise((res) => setTimeout(res, 1200));
        r = await synthesize(ttsText, voice);
      }
      if (r && r.provider === "mock" && voice.provider === "vieneu") {
        throw new Error(
          "VieNeu-TTS không phản hồi. Hãy kiểm tra cửa sổ app đang chạy, đợi model tải xong rồi bấm 'Tạo lại'."
        );
      }

      const ext = r?.ext || "wav";
      let buffer = r?.buffer || Buffer.alloc(0);
      if (pauses.length && ext === "wav") {
        const rate = buffer.length >= 44 ? buffer.readUInt32LE(24) : 48000;
        const pieces = buffer.length
          ? [buffer, ...pauses.map((ms) => makeSilenceWav(ms, rate))]
          : pauses.map((ms) => makeSilenceWav(ms, rate));
        buffer = concatWavs(pieces, 0);
      }
      results.push({ buffer, ext, provider: r?.provider || "vieneu" });

      const doneCount = batch.indices[batch.indices.length - 1] + 1;
      const soFarMs = results.reduce((n, x) => n + (x.ext === "wav" ? wavDurationMs(x.buffer) : 0), 0);
      db.prepare("UPDATE tts_jobs SET done = ?, duration_ms = ? WHERE id = ?").run(
        doneCount,
        soFarMs || estimatedAudioMs,
        jobId
      );
      batch.indices.forEach((i) =>
        db.prepare("UPDATE tts_job_chunks SET status = 'done' WHERE job_id = ? AND idx = ?").run(jobId, i)
      );
    }

    const ext = results[0]?.ext || "wav";
    const buffer =
      ext === "wav" ? concatWavs(results.map((r) => r.buffer), WAV_GAP_MS) : results[0].buffer;
    const provider = results[0]?.provider || "mock";
    const durationMs =
      ext === "wav"
        ? wavDurationMs(buffer) || results.reduce((n, x) => n + wavDurationMs(x.buffer), 0)
        : estimatedAudioMs;

    // Moc cau cho Karaoke: moi batch chia theo ty le ky tu, cong doan nghi giua 2 batch
    let acc = 0;
    batches.forEach((batch, bi) => {
      const dur = results[bi].ext === "wav" ? wavDurationMs(results[bi].buffer) : 0;
      const totalChars = batch.text.replace(/\s/g, "").length || 1;
      let sub = 0;
      batch.indices.forEach((i) => {
        const share = Math.round((chunks[i].replace(/\s/g, "").length / totalChars) * dur);
        sub += share;
        db.prepare("UPDATE tts_job_chunks SET duration_ms = ? WHERE job_id = ? AND idx = ?").run(
          acc + sub,
          jobId,
          i
        );
      });
      acc += dur + (bi < batches.length - 1 ? WAV_GAP_MS : 0);
    });

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
  void runJob(jobId, voice, chunks, text);
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

  // Moc cau da duoc tinh luc tao job (chia ty le theo ky tu tren audio lien mach)
  // duration_ms cua moi chunk chinh la endMs tich luy — khong cong gap lan nua
  let prevEnd = 0;
  const boundaries = chunks.map((c) => {
    const startMs = prevEnd;
    const endMs = c.duration_ms || 0;
    prevEnd = endMs;
    return { idx: c.idx, startMs, endMs };
  });

  return ok({
    job: {
      id: job.id,
      status: job.status,
      total: job.total,
      // Gioi han o total-1 trong luc audio that chua xong de UI khong bao 100% som
      done: job.status === "running" ? Math.min(job.done, Math.max(0, job.total - 1)) : job.done,
      currentIndex: job.current_index,
      provider: job.provider,
      error: job.error,
      resultUrl: job.result_audio_id ? `/api/audio/${job.result_audio_id}` : null,
      durationMs: job.duration_ms || prevEnd,
    },
    chunks,
    boundaries,
  });
}
