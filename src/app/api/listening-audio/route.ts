import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { r2Configured, r2Get } from "@/lib/r2";

// Serves pre-concatenated multi-voice listening clips from the R2 bank by key.
// Login-gated; key is strictly validated so it can only address the listening/ prefix.
const AUDIO_KEY = /^listening\/v1\/[a-f0-9]+\.mp3$/;
const hot = new Map<string, ArrayBuffer>();
const MAX_HOT = 120;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = (req.nextUrl.searchParams.get("key") || "").trim();
  if (!AUDIO_KEY.test(key)) return NextResponse.json({ error: "bad key" }, { status: 400 });

  const headers = (len: number) => ({
    "Content-Type": "audio/mpeg",
    "Content-Length": String(len),
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  const cached = hot.get(key);
  if (cached) return new NextResponse(cached, { headers: headers(cached.byteLength) });

  if (!r2Configured()) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  try {
    const found = await r2Get(key);
    if (found && found.byteLength > 0) {
      if (hot.size >= MAX_HOT) {
        const oldest = hot.keys().next().value;
        if (oldest) hot.delete(oldest);
      }
      hot.set(key, found);
      return new NextResponse(found, { headers: headers(found.byteLength) });
    }
  } catch {
    // fall through
  }
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
