import fs from "node:fs";
import db from "@/lib/db";
import { contentTypeFor } from "@/lib/audio";
import type { AudioItem } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = db.prepare("SELECT * FROM audio_items WHERE id = ?").get(Number(id)) as
    | AudioItem
    | undefined;
  if (!item || !fs.existsSync(item.file_path)) {
    return new Response("Not found", { status: 404 });
  }
  const buffer = fs.readFileSync(item.file_path);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeFor(item.file_path),
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
}
