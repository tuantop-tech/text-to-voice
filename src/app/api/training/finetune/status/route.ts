import { NextRequest } from "next/server";
import { authOr401, isResponse, ok, fail } from "@/lib/api";
import { paths } from "@/lib/db";
import { readDataset, datasetDir } from "@/lib/training";
import fs from "node:fs";
import path from "node:path";

export async function GET(req: NextRequest) {
  const user = await authOr401();
  if (isResponse(user)) return user;
  const voice = req.nextUrl.searchParams.get("voice") || "";
  if (!voice) return fail("Thiếu tên giọng");
  if (!readDataset(voice)) return fail("Chưa có dataset của giọng này", 404);
  const file = path.join(datasetDir(voice), "finetune_status.json");
  if (!fs.existsSync(file)) {
    return ok({ status: "idle", progress: 0, log: [], mode: "", gpu: false });
  }
  return ok(JSON.parse(fs.readFileSync(file, "utf8")));
}
