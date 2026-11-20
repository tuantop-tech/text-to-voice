export type Role = "admin" | "operator";

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  display_name: string;
  created_at: string;
}

export interface Voice {
  id: number;
  name: string;
  provider: "elevenlabs" | "vieneu" | "mock";
  voice_id: string;
  sample_path: string;
  language: string;
  gender: string;
  created_at: string;
  created_by: number;
}

export interface Script {
  id: number;
  name: string;
  content: string;
  rewritten: string;
  mode: RewriteMode;
  product_ids: string;
  created_at: string;
  updated_at: string;
}

export type RewriteMode = "sentence" | "paragraph" | "variable";

export interface Product {
  id: number;
  name: string;
  price: string;
  specs: string;
  link: string;
  image: string;
  note: string;
  created_at: string;
}

export interface Comment {
  id: number;
  author: string;
  text: string;
  source: string;
  status: "pending" | "replied" | "ignored";
  reply_text: string;
  created_at: string;
}

export interface AudioItem {
  id: number;
  text: string;
  voice_id: number;
  file_path: string;
  duration_ms: number;
  status: "queued" | "playing" | "done" | "skipped";
  source: "script" | "reply";
  session_id: number | null;
  created_at: string;
}

export interface LiveSession {
  id: number;
  started_at: string;
  ended_at: string | null;
  status: "running" | "stopped";
  voice_id: number | null;
  script_id: number | null;
  mode: string;
  operator_id: number;
}

export interface UsageLog {
  id: number;
  user_id: number;
  kind: string;
  amount: number;
  detail: string;
  created_at: string;
}

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  display_name: string;
}
