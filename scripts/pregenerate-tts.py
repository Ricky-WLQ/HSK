"""
Pre-generate the Mandarin TTS audio bank to Cloudflare R2.

CosyVoice2-0.5B non-deterministically drops the final syllable of short inputs
(verified: 40-60% failure on 1-3 char words). The fix is generate -> ASR-verify
the final character is present -> retry until correct. We do this once at build
time and store each clip in R2 keyed by a hash of the text, so runtime playback
is instant and guaranteed-correct. The Next.js runtime uses the SAME key scheme
(src/lib/tts.ts) and lazily fills any gaps.

Idempotent + resumable: skips words already present in R2.
Usage:  python scripts/pregenerate-tts.py [level ...]   (default: all levels)
        python scripts/pregenerate-tts.py --limit 15 1   (test: 15 words of HSK1)
Reads SILICONFLOW_API_KEY and R2_* from .env (gitignored).
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
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

SF_KEY = env["SILICONFLOW_API_KEY"]
TTS_MODEL = "FunAudioLLM/CosyVoice2-0.5B"
ASR_MODEL = "FunAudioLLM/SenseVoiceSmall"
VOICE_KEY = "narrator"
VOICE = f"{TTS_MODEL}:anna"
KEY_PREFIX = "tts/v1"  # must match src/lib/tts.ts
MAX_RETRY = 5

s3 = boto3.client(
    "s3",
    endpoint_url=env["R2_ENDPOINT"],
    aws_access_key_id=env["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
    config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
)
BUCKET = env["R2_BUCKET"]


def r2_key(text: str, voice_key: str = VOICE_KEY) -> str:
    h = hashlib.sha256(f"{voice_key}:{text}".encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}/{voice_key}/{h}.mp3"


def tts(text: str) -> bytes:
    inp = text if re.search(r"[。！？，、.!?…]$", text) else text + "。"
    body = json.dumps({
        "model": TTS_MODEL, "input": inp, "voice": VOICE,
        "response_format": "mp3", "speed": 0.9, "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.siliconflow.cn/v1/audio/speech", data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + SF_KEY})
    return urllib.request.urlopen(req, timeout=60).read()


def asr(mp3: bytes) -> str:
    b = "----hskpregenboundary"
    body = (
        ("--" + b + "\r\n").encode()
        + b'Content-Disposition: form-data; name="model"\r\n\r\n'
        + (ASR_MODEL + "\r\n").encode()
        + ("--" + b + "\r\n").encode()
        + b'Content-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'
        + mp3 + b"\r\n" + ("--" + b + "--\r\n").encode()
    )
    req = urllib.request.Request(
        "https://api.siliconflow.cn/v1/audio/transcriptions", data=body,
        headers={"Content-Type": "multipart/form-data; boundary=" + b, "Authorization": "Bearer " + SF_KEY})
    txt = json.loads(urllib.request.urlopen(req, timeout=60).read()).get("text", "")
    return re.sub(r"<\|[^|]*\|>", "", txt).strip()


def generate_verified(text: str):
    """Return (mp3_bytes, verified_bool). Retries until the final character of
    `text` appears in the ASR transcript. ASR is unreliable on a lone syllable,
    so when it never confirms we fall back to the LONGEST attempt (a truncated
    clip is shorter than a complete one)."""
    best = None
    best_len = -1
    target = text[-1]
    for _ in range(MAX_RETRY):
        try:
            audio = tts(text)
            if not audio:
                continue
            if len(audio) > best_len:
                best, best_len = audio, len(audio)
            if target in asr(audio):
                return audio, True
        except Exception:
            time.sleep(1.0)
    return best, False


def process(word):
    text = word["hanzi"]
    key = r2_key(text)
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return ("skip", text)
    except Exception:
        pass
    audio, ok = generate_verified(text)
    if not audio:
        return ("fail", text)
    s3.put_object(Bucket=BUCKET, Key=key, Body=audio, ContentType="audio/mpeg",
                  CacheControl="public, max-age=31536000, immutable")
    return ("ok" if ok else "unverified", text)


def main():
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
    print(f"pregenerating {len(words)} words -> R2 bucket '{BUCKET}'", flush=True)
    counts = {"ok": 0, "unverified": 0, "skip": 0, "fail": 0}
    done = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(process, w) for w in words]
        for fut in as_completed(futs):
            status, text = fut.result()
            counts[status] += 1
            done += 1
            if done % 100 == 0:
                print(f"  {done}/{len(words)}  {counts}", flush=True)
    print(f"DONE {counts}", flush=True)


if __name__ == "__main__":
    main()
