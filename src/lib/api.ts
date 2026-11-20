import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import type { PublicUser } from "./types";

export async function authOr401(): Promise<PublicUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  return user;
}

export function isResponse(value: PublicUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function ok(data: unknown) {
  return NextResponse.json(data);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
