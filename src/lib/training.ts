import fs from "node:fs";
import path from "node:path";
import { paths } from "./db";
import { getSetting } from "./settings";

export type Segment = {
  file: string;
  text: string;
  duration_ms: number;
  start_ms: number;
  end_ms: number;
};

export type Dataset = {
  voiceName: string;
  model: string;
  createdAt: string;
  segments: Segment[];
};

export type TrainedVoice = {
  name: string;
  label: string;
  modelDir: string;
  sampleFile: string;
  transcript: string;
  sampleDuration: number;
  dryRun: boolean;
  createdAt: string;
  modelPath: string;
  samplePath: string;
};

/** Ten giong -> ten thu muc an toan (khong cho di ra ngoai ./data/datasets) */
export function safeVoiceName(raw: string): string {
  const name = (raw || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  if (!name || name === "." || name === "..") throw new Error("Tên giọng không hợp lệ");
  return name;
}

export const datasetsRoot = path.join(paths.dataDir, "datasets");
fs.mkdirSync(datasetsRoot, { recursive: true });

export function datasetDir(voiceName: string): string {
  return path.join(datasetsRoot, safeVoiceName(voiceName));
}
export function rawAudioDir(voiceName: string): string {
  return path.join(datasetDir(voiceName), "raw_audio");
}
export function uploadsDir(voiceName: string): string {
  return path.join(datasetDir(voiceName), "uploads");
}
export function metadataFile(voiceName: string): string {
  return path.join(datasetDir(voiceName), "metadata.csv");
}
export function segmentsFile(voiceName: string): string {
  return path.join(datasetDir(voiceName), "segments.json");
}

export function readDataset(voiceName: string): Dataset | null {
  const file = segmentsFile(voiceName);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Dataset;
  } catch {
    return null;
  }
}

export function writeDataset(dataset: Dataset): void {
  const dir = datasetDir(dataset.voiceName);
  fs.mkdirSync(rawAudioDir(dataset.voiceName), { recursive: true });
  fs.writeFileSync(segmentsFile(dataset.voiceName), JSON.stringify(dataset, null, 2), "utf8");
  writeMetadata(dataset.voiceName, dataset.segments);
  void dir;
}

/** metadata.csv chuẩn: ten_file|noi_dung_van_ban */
export function writeMetadata(voiceName: string, segments: Segment[]): void {
  const lines = segments.map(
    (s) => `${s.file}|${String(s.text || "").replace(/[|\r\n]+/g, " ").trim()}`
  );
  fs.writeFileSync(metadataFile(voiceName), lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
}

export function listDatasets(): { name: string; count: number; createdAt: string; model: string }[] {
  if (!fs.existsSync(datasetsRoot)) return [];
  return fs
    .readdirSync(datasetsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const ds = readDataset(e.name);
      return {
        name: e.name,
        count: ds?.segments.length || 0,
        createdAt: ds?.createdAt || "",
        model: ds?.model || "",
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Base URL cua server giong Python (bo duoi /v1 de goi endpoint /v1/dataset/prepare) */
export function voiceServerBase(): string {
  return getSetting(
    "VIENEU_BASE_URL",
    process.env.VIENEU_BASE_URL || "http://127.0.0.1:8000/v1"
  )
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "");
}

export const trainedVoicesRoot = path.join(paths.dataDir, "outputs", "trained_voices");
fs.mkdirSync(trainedVoicesRoot, { recursive: true });

function toTrainedVoice(dir: string, name: string): TrainedVoice | null {
  const file = path.join(dir, name, "voice.json");
  if (!fs.existsSync(file)) return null;
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as Omit<
      TrainedVoice,
      "modelPath" | "samplePath"
    >;
    if (!v.name) return null;
    return {
      ...v,
      label: v.label || `${v.name} [Custom Fine-tuned]`,
      modelPath: path.join(paths.dataDir, v.modelDir),
      samplePath: path.join(paths.dataDir, v.sampleFile),
    };
  } catch {
    return null;
  }
}

export function listTrainedVoices(): TrainedVoice[] {
  if (!fs.existsSync(trainedVoicesRoot)) return [];
  return fs
    .readdirSync(trainedVoicesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => toTrainedVoice(trainedVoicesRoot, e.name))
    .filter((v): v is TrainedVoice => Boolean(v))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTrainedVoice(name: string): TrainedVoice | null {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  return toTrainedVoice(trainedVoicesRoot, safeVoiceName(name));
}
