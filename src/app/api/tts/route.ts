import { NextRequest } from "next/server";
import db, { now } from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { synthesize } from "@/lib/integrations";
import { saveAudio } from "@/lib/audio";
import { uid } from "@/lib/utils";
import type { Voice } from "@/lib/types";



// Chi cat dung ranh gioi cau — KHONG BAO GIO cat giua cau.
function chunkText(text: string, max = 300): string[] {
  const sentences = text
    .split(/(?<=[.!?…。！？\n])/)
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

async function runJob(jobId: string, voice: Voice, chunks: string[], fullText: string) {
  try {
    // Tien trinh hien thi chay dan song song voi viec tao audio.
    // Audio van duoc tao trong 1 request (doc lien mach), khong cat thanh tung doan.
    // Uoc luong thoi gian tao (~10 ky tu/giay tren CPU) de tien trinh chay khop thuc te.
    // Dong thoi uoc luong THOI LUONG AUDIO (~18 ky tu/giay noi) de hien so ngay khi dang tao.
    const estimatedBuildMs = Math.max(1500, (fullText.length / 10) * 1000);
    const perChunkMs = Math.min(350, Math.max(120, Math.round(estimatedBuildMs / chunks.length)));
    const estimatedAudioMs = Math.max(1000, Math.round((fullText.length / 18) * 1000));
    const totalChars0 = chunks.reduce((n, c) => n + c.length, 0) || 1;
    const shares0 = chunks.map((c) => Math.round((c.length / totalChars0) * estimatedAudioMs));

    // Dat time luong uoc luong ngay tu dau de UI khong hien 00:00 / 0s
    db.prepare("UPDATE tts_jobs SET duration_ms = ? WHERE id = ?").run(estimatedAudioMs, jobId);
    let acc0 = 0;
    chunks.forEach((_c, i) => {
      acc0 += shares0[i];
      db.prepare("UPDATE tts_job_chunks SET duration_ms = ? WHERE job_id = ? AND idx = ?").run(
        acc0,
        jobId,
        i
      );
    });

    const progressDone = (async () => {
      let acc = 0;
      for (let i = 0; i < chunks.length; i++) {
        db.prepare("UPDATE tts_jobs SET current_index = ? WHERE id = ?").run(i, jobId);
        db.prepare("UPDATE tts_job_chunks SET status = 'running' WHERE job_id = ? AND idx = ?").run(jobId, i);
        await new Promise((resolve) => setTimeout(resolve, perChunkMs));
        acc += shares0[i];
        db.prepare("UPDATE tts_job_chunks SET status = 'done' WHERE job_id = ? AND idx = ?").run(jobId, i);
        db.prepare("UPDATE tts_jobs SET done = ?, duration_ms = ? WHERE id = ?").run(i + 1, acc, jobId);
      }
    })();

    // Mot request duy nhat cho TOAN BO doan van -> giong doc lien mach, khong bi gay o ranh gioi cau
    const r = await synthesize(fullText, voice);
    await progressDone;
    const ext = r.ext;
    const buffer = r.buffer;
    const durationMs =
      ext === "wav" && buffer.length >= 44
        ? Math.round((buffer.readUInt32LE(40) / (buffer.readUInt32LE(24) * 2)) * 1000)
        : r.durationMs;
    const provider = r.provider;

    // Chia thoi luong theo ty le ky tu de co moc cau cho Karaoke/Pause
    // (chi la moc hien thi — KHONG cat audio that)
    const totalChars = chunks.reduce((n, c) => n + c.length, 0) || 1;
    let acc = 0;
    for (let i = 0; i < chunks.length; i++) {
      const share = Math.round((chunks[i].length / totalChars) * durationMs);
      acc += share;
      db.prepare(
        "UPDATE tts_job_chunks SET duration_ms = ? WHERE job_id = ? AND idx = ?"
      ).run(acc, jobId, i);
    }

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
