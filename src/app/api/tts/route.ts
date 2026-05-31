import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { ttsKey, normalizeVoiceKey, generateVerifiedAudio } from "@/lib/tts";
import { r2Configured, r2Get, r2Put } from "@/lib/r2";

// Audio is pre-generated to R2 (scripts/pregenerate-tts.py) and served from there;
// anything missing is generated on demand (ASR-verified), cached, and uploaded.
// Login-gated: only authenticated users can spend the TTS/SiliconFlow quota.

// Small hot in-memory LRU so repeated plays of the same word skip the R2 round-trip.
const hot = new Map<string, ArrayBuffer>();
const MAX_HOT = 200;
function hotGet(key: string): ArrayBuffer | undefined {
  const v = hot.get(key);
  if (v) {
    hot.delete(key);
    hot.set(key, v); // move to MRU
  }
  return v;
}
function hotSet(key: string, val: ArrayBuffer) {
  if (hot.size >= MAX_HOT) {
    const oldest = hot.keys().next().value;
    if (oldest) hot.delete(oldest);
  }
  hot.set(key, val);
}

// Per-user rate limit on on-demand generation (R2 hits are unmetered).
const gen = new Map<string, { count: number; reset: number }>();
function genLimited(userId: string): boolean {
  const now = Date.now();
  const e = gen.get(userId);
  if (!e || now > e.reset) {
    gen.set(userId, { count: 1, reset: now + 60_000 });
    return false;
  }
  e.count += 1;
  return e.count > 60; // 60 fresh generations / minute / user
}
// Periodically drop expired entries so the maps don't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of gen) if (now > v.reset) gen.delete(k);
}, 5 * 60_000).unref?.();

function audioHeaders(len: number) {
  return {
    "Content-Type": "audio/mpeg",
    "Content-Length": String(len),
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const text = (req.nextUrl.searchParams.get("text") || "").trim();
  const voiceKey = normalizeVoiceKey(req.nextUrl.searchParams.get("voice"));
  if (!text || text.length > 60) {
    return NextResponse.json({ error: "invalid text" }, { status: 400 });
  }

  const key = ttsKey(text, voiceKey);

  // 1) hot cache
  const cached = hotGet(key);
  if (cached) return new NextResponse(cached, { headers: audioHeaders(cached.byteLength) });

  // 2) R2 bank
  if (r2Configured()) {
    try {
      const found = await r2Get(key);
      if (found && found.byteLength > 0) {
        hotSet(key, found);
        return new NextResponse(found, { headers: audioHeaders(found.byteLength) });
      }
    } catch {
      // fall through to generation
    }
  }

  // 3) generate on demand (rate-limited, ASR-verified)
  if (genLimited(session.user.id)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  let audio: ArrayBuffer | null = null;
  try {
    audio = await generateVerifiedAudio(text, voiceKey);
  } catch {
    audio = null;
  }
  if (!audio || audio.byteLength === 0) {
    return NextResponse.json({ error: "tts unavailable" }, { status: 502 });
  }
  hotSet(key, audio);
  if (r2Configured()) void r2Put(key, audio); // best-effort persist; don't block

  return new NextResponse(audio, { headers: audioHeaders(audio.byteLength) });
}
