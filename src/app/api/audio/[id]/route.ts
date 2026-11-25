import fs from "node:fs";
import { Readable } from "node:stream";
import db from "@/lib/db";
import { contentTypeFor } from "@/lib/audio";
import type { AudioItem } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = db.prepare("SELECT * FROM audio_items WHERE id = ?").get(Number(id)) as
    | AudioItem
    | undefined;
  if (!item || !fs.existsSync(item.file_path)) {
    return new Response("Not found", { status: 404 });
  }

  const stat = fs.statSync(item.file_path);
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(item.file_path),
    "Cache-Control": "public, max-age=3600",
    "Accept-Ranges": "bytes",
  };

  // Ho tro Range de browser seek duoc va co duration that (quan trong voi file WAV lon)
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (m[1] && !m[2]) end = stat.size - 1;
      if (!m[1] && m[2]) {
        start = Math.max(0, stat.size - parseInt(m[2], 10));
        end = stat.size - 1;
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }
      end = Math.min(end, stat.size - 1);
      headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
      headers["Content-Length"] = String(end - start + 1);
      const stream = fs.createReadStream(item.file_path, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
    }
  }

  headers["Content-Length"] = String(stat.size);
  const stream = fs.createReadStream(item.file_path);
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers });
}
