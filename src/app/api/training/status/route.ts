import { NextResponse } from "next/server";
import { authOr401, isResponse, ok } from "@/lib/api";
import { voiceServerBase } from "@/lib/training";
import "@/lib/integrations"; // dat timeout 20 phut cho fetch

export async function GET() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  try {
    const res = await fetch(`${voiceServerBase()}/v1/training/status`);
    const data = await res.json();
    return ok(data);
  } catch (err) {
    return NextResponse.json({
      faster_whisper: false,
      av: false,
      error: `Không kết nối được server giọng: ${(err as Error).message}`,
    });
  }
}
