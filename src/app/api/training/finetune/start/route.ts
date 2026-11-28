import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { paths } from "@/lib/db";
import { safeVoiceName, voiceServerBase } from "@/lib/training";
import "@/lib/integrations"; // timeout 20 phut

export async function POST(req: Request) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  try {
    const body = (await req.json()) as {
      voice?: string;
      epochs?: number;
      batchSize?: number;
      lr?: number;
      repoDir?: string;
    };
    const voice = safeVoiceName(body.voice || "");
    const params = {
      epochs: Number(body.epochs) || 3,
      batchSize: Number(body.batchSize) || 4,
      gradAccum: 4,
      lr: Number(body.lr) || 0.0002,
    };
    const res = await fetch(`${voiceServerBase()}/v1/finetune/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data_dir: paths.dataDir,
        voice_name: voice,
        params,
        repo_dir: body.repoDir || "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data.error || "Không bắt đầu được huấn luyện", 502);
    return ok(data);
  } catch (err) {
    return fail((err as Error).message);
  }
}
