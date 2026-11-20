import fs from "node:fs";
import path from "node:path";

export function buildId(): string {
  try {
    const file = path.join(process.cwd(), ".next", "BUILD_ID");
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "dev";
  }
}
