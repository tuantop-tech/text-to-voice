import { ok } from "@/lib/api";
import { buildId } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ id: buildId() });
}
