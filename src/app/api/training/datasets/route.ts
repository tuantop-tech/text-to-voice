import { authOr401, isResponse, ok } from "@/lib/api";
import { listDatasets } from "@/lib/training";

export async function GET() {
  const user = await authOr401();
  if (isResponse(user)) return user;
  return ok({ datasets: listDatasets() });
}
