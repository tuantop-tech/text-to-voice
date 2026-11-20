import db from "@/lib/db";
import { authOr401, isResponse, ok, fail } from "@/lib/api";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const { id } = await params;
  db.prepare("DELETE FROM voices WHERE id = ?").run(Number(id));
  return ok({ done: true });
}
