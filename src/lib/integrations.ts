import fs from "node:fs";
import { Agent, setGlobalDispatcher } from "undici";
import { makeBeepWav, splitSentences, uid } from "./utils";

// Doan van dai tren CPU co the mat > 5 phut -> nang timeout mac dinh cua fetch
setGlobalDispatcher(
  new Agent({ headersTimeout: 20 * 60 * 1000, bodyTimeout: 20 * 60 * 1000 })
);
import { getSetting } from "./settings";
import type { RewriteMode, Voice } from "./types";

const elKey = () => getSetting("ELEVENLABS_API_KEY", process.env.ELEVENLABS_API_KEY || "");
const llmKey = () => getSetting("LLM_API_KEY", process.env.LLM_API_KEY || "");
const llmBase = () =>
  getSetting("LLM_BASE_URL", process.env.LLM_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const llmModel = () => getSetting("LLM_MODEL", process.env.LLM_MODEL || "deepseek-chat");

// VieNeu-TTS (OpenAI-compatible API chay local qua Docker/Python)
const vieneuBase = () =>
  getSetting("VIENEU_BASE_URL", process.env.VIENEU_BASE_URL || "http://127.0.0.1:8000/v1")
    .replace(/\/$/, "");
const vieneuKey = () => getSetting("VIENEU_API_KEY", process.env.VIENEU_API_KEY || "");
export const voiceProvider = () =>
  getSetting("TTS_PROVIDER", process.env.TTS_PROVIDER || "vieneu");
export const hasVieNeu = () => Boolean(vieneuBase());

function vieneuHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (vieneuKey()) h.Authorization = `Bearer ${vieneuKey()}`;
  return h;
}

export const hasElevenLabs = () => Boolean(elKey());
export const hasLLM = () => Boolean(llmKey());

export type Segment = { text: string; variants: string[] };
export type TtsResult = {
  buffer: Buffer;
  ext: "mp3" | "wav";
  provider: "elevenlabs" | "vieneu" | "mock";
  durationMs: number;
};

function estimateDuration(text: string) {
  return Math.max(1200, text.length * 90);
}

export async function synthesize(text: string, voice: Voice): Promise<TtsResult> {
  // 1) VieNeu-TTS — OpenAI-compatible /v1/audio/speech, chay local
  if (voice.provider === "vieneu" && vieneuBase()) {
    try {
      const res = await fetch(`${vieneuBase()}/audio/speech`, {
        method: "POST",
        headers: vieneuHeaders(),
        body: JSON.stringify({
          model: "vieneu-v3-turbo",
          input: text,
          voice: voice.voice_id || undefined,
          response_format: "wav",
          stream_format: "audio",
        }),
      });
      if (res.ok) {
        return {
          buffer: Buffer.from(await res.arrayBuffer()),
          ext: "wav",
          provider: "vieneu",
          durationMs: estimateDuration(text),
        };
      }
      console.error("[VieNeu TTS]", res.status, (await res.text()).slice(0, 300));
    } catch (err) {
      console.error("[VieNeu TTS]", err);
    }
  }

  // 2) ElevenLabs
  if (elKey() && voice.provider === "elevenlabs" && voice.voice_id) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voice_id)}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elKey(),
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1 },
          }),
        }
      );
      if (res.ok) {
        return {
          buffer: Buffer.from(await res.arrayBuffer()),
          ext: "mp3",
          provider: "elevenlabs",
          durationMs: estimateDuration(text),
        };
      }
      console.error("[ElevenLabs TTS]", res.status, (await res.text()).slice(0, 300));
    } catch (err) {
      console.error("[ElevenLabs TTS]", err);
    }
  }
  return { buffer: makeBeepWav(), ext: "wav", provider: "mock", durationMs: 700 };
}

export async function cloneVoice(samplePath: string, name: string): Promise<string> {
  if (voiceProvider() === "vieneu" && vieneuBase()) {
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("description", "Livestream AI voice");
      form.append("denoise", "true");
      const buf = fs.readFileSync(samplePath);
      const fileName = samplePath.split(/[\\/]/).pop() || "sample.wav";
      const mime = fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
      form.append("file", new Blob([buf], { type: mime }), fileName);
      const headers: Record<string, string> = {};
      if (vieneuKey()) headers.Authorization = `Bearer ${vieneuKey()}`;
      const res = await fetch(`${vieneuBase()}/voices`, { method: "POST", headers, body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      // API dung chinh ten lam voice id -> tra ve ten de luu vao DB
      return name;
    } catch (err) {
      console.error("[VieNeu clone]", err);
      return `mock_${uid()}`;
    }
  }
  if (!elKey()) return `mock_${uid()}`;
  try {
    const form = new FormData();
    form.append("name", name);
    form.append("description", "Livestream AI voice - Vietnamese");
    const buf = fs.readFileSync(samplePath);
    const fileName = samplePath.split(/[\\/]/).pop() || "sample.mp3";
    const mime = fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
    form.append("files", new Blob([buf], { type: mime }), fileName);
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": elKey() },
      body: form,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { voice_id: string };
    return json.voice_id;
  } catch (err) {
    console.error("[ElevenLabs clone]", err);
    return `mock_${uid()}`;
  }
}

export async function listProviderVoices(): Promise<
  { voice_id: string; name: string; gender?: string; featured?: boolean }[]
> {
  if (voiceProvider() === "vieneu" && vieneuBase()) {
    try {
      const headers: Record<string, string> = {};
      if (vieneuKey()) headers.Authorization = `Bearer ${vieneuKey()}`;
      const res = await fetch(`${vieneuBase()}/voices`, { headers });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: { id?: string; name: string; gender?: string; featured?: boolean }[];
      };
      return (json.data || []).map((v) => ({
        voice_id: v.id || v.name,
        name: v.name,
        gender: v.gender,
        featured: v.featured,
      }));
    } catch (err) {
      console.error("[VieNeu voices]", err);
      return [];
    }
  }
  if (!elKey()) return [];
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": elKey() },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { voices: { voice_id: string; name: string }[] };
    return json.voices.map((v) => ({ voice_id: v.voice_id, name: v.name }));
  } catch {
    return [];
  }
}

function demoRewrite(text: string, mode: RewriteMode): Segment[] {
  const raw = mode === "paragraph" ? text.split(/\n+/).filter(Boolean) : splitSentences(text);
  return raw.map((sentence) => {
    const clean = sentence.trim();
    const stripped = clean.replace(/[。.!！?？,，]+$/, "");
    const variants =
      mode === "variable"
        ? [
            clean,
            stripped.replace(/\b(mua|đặt)\b/gi, "đặt hàng"),
            stripped.replace(/\b(rẻ|giá rẻ)\b/gi, "giá tốt"),
            stripped.replace(/\b(đẹp|xinh)\b/gi, "xinh xắn"),
          ]
        : [clean, `${stripped} nha.`, `${stripped} à.`];
    return { text: clean, variants: [...new Set(variants)].filter(Boolean) };
  });
}

export async function rewriteScript(
  text: string,
  mode: RewriteMode,
  products: string[]
): Promise<Segment[]> {
  if (!llmKey()) return demoRewrite(text, mode);
  const modeText =
    mode === "sentence"
      ? "chia theo từng câu"
      : mode === "paragraph"
        ? "chia theo từng đoạn"
        : "tách từ khóa và thay bằng biến thể đồng nghĩa";
  const prompt = `Bạn là chuyên gia viết kịch bản livestream bán hàng tiếng Việt.
Hãy ${modeText} cho nội dung bên dưới. Với mỗi phần, tạo 3-5 cách diễn đạt tự nhiên, khác nhau để主播 luân phiên đọc (tránh lặp từ), giữ nguyên ý nghĩa.
Sản phẩm liên quan: ${products.join(", ") || "không có"}

Nội dung:
${text}

Chỉ trả về JSON hợp lệ dạng {"segments":[{"text":"đoạn gốc","variants":["cách 1","cách 2","cách 3"]}]}. Không giải thích.`;

  try {
    const res = await fetch(`${llmBase()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmKey()}`,
      },
      body: JSON.stringify({
        model: llmModel(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    let content = json.choices[0].message.content.trim();
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(content) as { segments?: Segment[] };
    if (!parsed.segments?.length) return demoRewrite(text, mode);
    return parsed.segments.map((s) => ({
      text: s.text,
      variants: s.variants?.length ? s.variants : [s.text],
    }));
  } catch (err) {
    console.error("[LLM rewrite]", err);
    return demoRewrite(text, mode);
  }
}

export async function suggestReply(
  comment: string,
  scriptContext: string,
  products: string[]
): Promise<string> {
  if (!llmKey()) {
    const c = comment.toLowerCase();
    if (/giá|bao nhiêu|price/.test(c)) return "Bên mình có bảng giá rất tốt ạ, bạn inbox để nhận giá ưu đãi hôm nay nha!";
    if (/size|kích cỡ|màu/.test(c)) return "Bạn chọn size và màu theo form尺码 bên dưới nha, bên mình có đầy đủ size ạ!";
    if (/ship|giao|vận chuyển/.test(c)) return "Bên mình giao hàng toàn quốc, nội thành giao nhanh trong ngày ạ!";
    if (/đổi|trả|bảo hành/.test(c)) return "Bạn yên tâm, bên mình có đổi trả trong 7 ngày, có运费险 đầy đủ ạ!";
    if (/có hàng|con hàng/.test(c)) return "Có hàng sẵn ạ, bạn chốt đơn sớm để được ưu tiên giao nhanh nha!";
    return "Cảm ơn bạn đã quan tâm, bên mình đang có ưu đãi tốt hôm nay, bạn inbox để được tư vấn chi tiết nha!";
  }
  const prompt = `Bạn là trợ lý livestream bán hàng tiếng Việt. Hãy trả lời ngắn gọn (1-2 câu), thân thiện, thúc đẩy chốt đơn cho bình luận sau của khách.
Kịch bản đang nói: ${scriptContext.slice(0, 500)}
Sản phẩm: ${products.join(", ") || "không có"}
Bình luận khách: ${comment}

Chỉ trả về nội dung câu trả lời, không giải thích.`;
  try {
    const res = await fetch(`${llmBase()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmKey()}`,
      },
      body: JSON.stringify({
        model: llmModel(),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return json.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
  } catch (err) {
    console.error("[LLM reply]", err);
    return "Cảm ơn bạn đã quan tâm, bạn inbox để được tư vấn chi tiết nha!";
  }
}
