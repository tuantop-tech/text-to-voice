import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./crypto";

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "audio"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "samples"), { recursive: true });

export const paths = {
  dataDir,
  audioDir: path.join(dataDir, "audio"),
  sampleDir: path.join(dataDir, "samples"),
  dbFile: path.join(dataDir, "app.db"),
};

const db = new DatabaseSync(paths.dbFile);
db.exec("PRAGMA busy_timeout = 15000;");
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS voices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  sample_path TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'vi',
  gender TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  rewritten TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'sentence',
  product_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price TEXT NOT NULL DEFAULT '',
  specs TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL DEFAULT 'Khách',
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  reply_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audio_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  voice_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT NOT NULL DEFAULT 'script',
  session_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS live_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  voice_id INTEGER,
  script_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'off',
  operator_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tts_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  total INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  current_index INTEGER NOT NULL DEFAULT -1,
  voice_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  result_audio_id INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS tts_job_chunks (
  job_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, idx)
);
`);

const jobCols = db.prepare("PRAGMA table_info(tts_jobs)").all() as unknown as { name: string }[];
if (!jobCols.some((c) => c.name === "duration_ms")) {
  db.exec("ALTER TABLE tts_jobs ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0");
}

db.prepare(
  "INSERT OR IGNORE INTO users (username, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)"
).run("admin", hashPassword("admin123"), "admin", "Quản trị", new Date().toISOString());

export default db;

export function now(): string {
  return new Date().toISOString();
}
