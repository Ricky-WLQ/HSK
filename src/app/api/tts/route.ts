import { NextRequest, NextResponse } from "next/server";

const SF_URL = "https://api.siliconflow.cn/v1/audio/speech";
const MODEL = "FunAudioLLM/CosyVoice2-0.5B";
const VOICES: Record<string, string> = {
  narrator: `${MODEL}:anna`,
  female: `${MODEL}:claire`,
  male: `${MODEL}:charles`,
};

// Per-instance in-memory cache (single Zeabur instance) so repeated plays of the
// same word don't re-hit SiliconFlow.
const cache = new Map<string, ArrayBuffer>();
const MAX_CACHE = 800;

// Crude per-IP rate limit to bound cost on this public endpoint.
const hits = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.reset) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  e.count += 1;
  return e.count > 80; // 80 requests / minute / IP
}

function audioHeaders() {
  return {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") || "").trim();
  const voiceKey = req.nextUrl.searchParams.get("voice") || "narrator";
  if (!text || text.length > 200) {
    return NextResponse.json({ error: "invalid text" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const voice = VOICES[voiceKey] ?? VOICES.narrator;
  const cacheKey = `${voiceKey}::${text}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return new NextResponse(cached, { headers: audioHeaders() });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "tts not configured" }, { status: 503 });
  }

  const res = await fetch(SF_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
      voice,
      response_format: "mp3",
      speed: 0.9,
      stream: false,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    return NextResponse.json({ error: "tts failed", detail }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(cacheKey, buf);
  return new NextResponse(buf, { headers: audioHeaders() });
}
