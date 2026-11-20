import { NextRequest } from "next/server";
import { authOr401, isResponse, ok } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/settings";
import { hasElevenLabs, hasLLM, hasVieNeu, voiceProvider } from "@/lib/integrations";

const KEYS = [
  "TTS_PROVIDER",
  "VIEUNEU_BASE_URL",
  "VIEUNEU_API_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_MODEL_ID",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_MODEL",
  "DANMAKU_WEBHOOK_SECRET",
];

export async function GET() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const values: Record<string, string> = {};
  for (const k of KEYS) values[k] = getSetting(k);
  return ok({
    values,
    hasElevenLabs: hasElevenLabs(),
    hasVieNeu: hasVieNeu(),
    hasLLM: hasLLM(),
    provider: voiceProvider(),
  });
}

export async function PUT(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const b = (await req.json()) as Record<string, string>;
  for (const k of KEYS) {
    if (k in b && typeof b[k] === "string") setSetting(k, b[k].trim());
  }
  return ok({
    done: true,
    hasElevenLabs: hasElevenLabs(),
    hasVieNeu: hasVieNeu(),
    hasLLM: hasLLM(),
    provider: voiceProvider(),
  });
}
