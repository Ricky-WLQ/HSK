"""
Pre-generate the Mandarin TTS audio bank to Cloudflare R2 using **Edge TTS**
(Microsoft neural voices — free, production-grade). This replaces CosyVoice2-0.5B,
which non-deterministically produced silent/truncated audio on short words.

Edge TTS renders every word reliably and at consistent volume (verified: 30/30
words, 0 silent, min loudness far above CosyVoice2's best). Same R2 key scheme as
the Node runtime (src/lib/tts.ts): tts/v1/{voiceKey}/sha256(voiceKey:text).mp3.

Idempotent + resumable: objects are tagged `engine=edge`; a re-run skips words
already regenerated with Edge (so it also replaces the old CosyVoice clips).
Usage:  python scripts/pregenerate-tts.py [level ...]   (default: all levels)
        python scripts/pregenerate-tts.py --limit 20 1
Reads R2_* from .env (gitignored). Edge TTS needs no API key.
"""
import asyncio
import hashlib
import json
import os
import sys

import boto3
import edge_tts
from botocore.config import Config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(ROOT, "src", "data", "vocab")
env = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')

VOICE_KEY = "narrator"
EDGE_VOICE = "zh-CN-XiaoxiaoNeural"  # must match src/lib/tts.ts narrator voice
EDGE_RATE = "-10%"
KEY_PREFIX = "tts/v1"
CONCURRENCY = 16
GEN_TIMEOUT = 20
MAX_RETRY = 6

s3 = boto3.client("s3", endpoint_url=env["R2_ENDPOINT"], aws_access_key_id=env["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"], region_name="auto",
    config=Config(signature_version="s3v4", retries={"max_attempts": 3}))
BUCKET = env["R2_BUCKET"]
sem = asyncio.Semaphore(CONCURRENCY)


def r2_key(text, voice_key=VOICE_KEY):
    h = hashlib.sha256(f"{voice_key}:{text}".encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}/{voice_key}/{h}.mp3"


async def edge_generate(text):
    """Return mp3 bytes, or None after exhausting retries. Per-call hard timeout
    guards against Edge's occasional WebSocket hang."""
    for attempt in range(MAX_RETRY):
        try:
            comm = edge_tts.Communicate(text, EDGE_VOICE, rate=EDGE_RATE)
            chunks = []

            async def collect():
                async for ch in comm.stream():
                    if ch["type"] == "audio":
                        chunks.append(ch["data"])

            await asyncio.wait_for(collect(), timeout=GEN_TIMEOUT)
            audio = b"".join(chunks)
            if audio:
                return audio
        except Exception:
            await asyncio.sleep(1.0 * (attempt + 1))
    return None


async def process(word):
    text = word["hanzi"]
    key = r2_key(text)
    async with sem:
        # resumable: skip words already regenerated with Edge
        try:
            head = await asyncio.to_thread(s3.head_object, Bucket=BUCKET, Key=key)
            if head.get("Metadata", {}).get("engine") == "edge":
                return "skip"
        except Exception:
            pass
        audio = await edge_generate(text)
        if not audio:
            return "fail"
        try:
            await asyncio.to_thread(
                s3.put_object, Bucket=BUCKET, Key=key, Body=audio, ContentType="audio/mpeg",
                CacheControl="public, max-age=31536000, immutable", Metadata={"engine": "edge"})
        except Exception:
            return "fail"
        return "ok"


async def main():
    args = sys.argv[1:]
    limit = None
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1])
        args = args[:i] + args[i + 2:]
    levels = args or ["1", "2", "3", "4", "5", "6", "7-9"]
    words = []
    for lv in levels:
        words += json.load(open(os.path.join(VOCAB, f"hsk{lv}.json"), encoding="utf-8"))
    if limit:
        words = words[:limit]
    print(f"Edge-TTS pregenerating {len(words)} words -> R2 '{BUCKET}'", flush=True)
    counts = {"ok": 0, "skip": 0, "fail": 0}
    done = 0
    tasks = [asyncio.ensure_future(process(w)) for w in words]
    for fut in asyncio.as_completed(tasks):
        counts[await fut] += 1
        done += 1
        if done % 100 == 0:
            print(f"  {done}/{len(words)}  {counts}", flush=True)
    print(f"DONE {counts}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
