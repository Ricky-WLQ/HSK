import { createHash } from "node:crypto";
import { Communicate } from "edge-tts-universal";

// Mandarin TTS via Edge TTS (Microsoft neural voices — free, production-grade).
// Replaces CosyVoice2-0.5B, which non-deterministically produced silent/truncated
// audio on short words. Clips are keyed by a hash of the text so the build-time
// pregenerator (scripts/pregenerate-tts.py) and this runtime share one R2 bank —
// keep the key scheme + voice mapping in sync with that script.
const VOICES: Record<string, string> = {
  narrator: "zh-CN-XiaoxiaoNeural",
  female: "zh-CN-XiaoyiNeural",
  male: "zh-CN-YunxiNeural",
};
const RATE = "-10%";
const GEN_TIMEOUT_MS = 20_000;
const MAX_RETRY = 5;

export const VOICE_KEYS = Object.keys(VOICES);

export function normalizeVoiceKey(v: string | null | undefined): string {
  return v && VOICES[v] ? v : "narrator";
}

export function ttsKey(text: string, voiceKey = "narrator"): string {
  const h = createHash("sha256").update(`${voiceKey}:${text}`).digest("hex");
  return `tts/v1/${voiceKey}/${h}.mp3`;
}

async function synthOnce(text: string, voice: string): Promise<Buffer> {
  const comm = new Communicate(text, { voice, rate: RATE });
  const chunks: Buffer[] = [];
  const collect = (async () => {
    for await (const ch of comm.stream()) {
      if (ch.type === "audio" && ch.data) chunks.push(ch.data as Buffer);
    }
  })();
  // Hard timeout: Edge's WebSocket can occasionally hang; don't await it forever.
  await Promise.race([
    collect,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("edge-tts timeout")), GEN_TIMEOUT_MS),
    ),
  ]);
  return Buffer.concat(chunks);
}

/**
 * Generate Mandarin audio for `text`. Retries on Edge's occasional WebSocket
 * hang/timeout. Returns an ArrayBuffer, or null if every attempt failed.
 */
export async function generateAudio(
  text: string,
  voiceKey = "narrator",
): Promise<ArrayBuffer | null> {
  const voice = VOICES[voiceKey] ?? VOICES.narrator;
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      const buf = await synthOnce(text, voice);
      if (buf.byteLength > 0) {
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return null;
}
