import { createHash } from "node:crypto";

// Server-side Mandarin TTS via SiliconFlow CosyVoice2, with ASR verification.
// CosyVoice2-0.5B non-deterministically drops the final syllable of short inputs;
// the fix is to append sentence-final punctuation and verify the final character
// is actually present (SenseVoiceSmall ASR), retrying until it is. Clips are keyed
// by a hash of the text so the build-time pregenerator (scripts/pregenerate-tts.py)
// and this runtime share one R2 bank — keep the key scheme in sync with that script.
const SF_TTS = "https://api.siliconflow.cn/v1/audio/speech";
const SF_ASR = "https://api.siliconflow.cn/v1/audio/transcriptions";
const TTS_MODEL = "FunAudioLLM/CosyVoice2-0.5B";
const ASR_MODEL = "FunAudioLLM/SenseVoiceSmall";
const VOICES: Record<string, string> = {
  narrator: `${TTS_MODEL}:anna`,
  female: `${TTS_MODEL}:claire`,
  male: `${TTS_MODEL}:charles`,
};
const MAX_RETRY = 4;

export const VOICE_KEYS = Object.keys(VOICES);

export function normalizeVoiceKey(v: string | null | undefined): string {
  return v && VOICES[v] ? v : "narrator";
}

export function ttsKey(text: string, voiceKey = "narrator"): string {
  const h = createHash("sha256").update(`${voiceKey}:${text}`).digest("hex");
  return `tts/v1/${voiceKey}/${h}.mp3`;
}

async function synth(text: string, voiceKey: string, apiKey: string): Promise<ArrayBuffer> {
  const input = /[。！？，、.!?…]$/.test(text) ? text : `${text}。`;
  const res = await fetch(SF_TTS, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: TTS_MODEL,
      input,
      voice: VOICES[voiceKey] ?? VOICES.narrator,
      response_format: "mp3",
      speed: 0.9,
      stream: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  return res.arrayBuffer();
}

async function asrContains(audio: ArrayBuffer, target: string, apiKey: string): Promise<boolean> {
  const fd = new FormData();
  fd.append("model", ASR_MODEL);
  fd.append("file", new Blob([audio], { type: "audio/mpeg" }), "a.mp3");
  const res = await fetch(SF_ASR, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return false;
  const j = (await res.json()) as { text?: string };
  const txt = (j.text ?? "").replace(/<\|[^|]*\|>/g, "");
  return txt.includes(target);
}

/**
 * Generate audio whose final syllable is verified present. Retries on failure;
 * falls back to the longest attempt (a truncated clip is shorter than a complete
 * one). Returns null only if TTS is unconfigured or every attempt errored.
 */
export async function generateVerifiedAudio(
  text: string,
  voiceKey = "narrator",
): Promise<ArrayBuffer | null> {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) return null;
  const target = text[text.length - 1];
  let best: ArrayBuffer | null = null;
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      const audio = await synth(text, voiceKey, apiKey);
      if (audio.byteLength === 0) continue;
      if (!best || audio.byteLength > best.byteLength) best = audio;
      if (await asrContains(audio, target, apiKey)) return audio;
    } catch {
      // network/timeout — try again
    }
  }
  return best;
}
