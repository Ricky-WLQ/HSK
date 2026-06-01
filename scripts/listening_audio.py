"""
Multi-voice listening-audio builder. Renders each dialogue/monologue TURN with a
distinct Edge-TTS neural voice, concatenates the turns with a short pause between
them (ffmpeg), and persists ONE mp3 per audio unit to Cloudflare R2.

Voices MUST match src/lib/tts.ts:
  narrator = zh-CN-XiaoxiaoNeural, male = zh-CN-YunxiNeural, female = zh-CN-XiaoyiNeural

Key scheme: listening/v1/{sha256(json(lines))}.mp3 — deterministic, so generation +
runtime serving + re-runs all agree, and pregeneration is idempotent.

Used by generate-listening.py (assigns keys/lines) and a pregeneration pass; also a
CLI to smoke one dialogue:  python scripts/listening_audio.py
"""
import asyncio
import hashlib
import json
import os
import re
import subprocess
import tempfile

import boto3
import edge_tts
from botocore.config import Config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')

VOICES = {
    "narrator": "zh-CN-XiaoxiaoNeural",
    "male": "zh-CN-YunxiNeural",
    "female": "zh-CN-XiaoyiNeural",
}
RATE = "-10%"
KEY_PREFIX = "listening/v1"
GAP_MS = 350  # inter-turn pause
GEN_TIMEOUT = 25
MAX_RETRY = 6

s3 = boto3.client(
    "s3", endpoint_url=env["R2_ENDPOINT"], aws_access_key_id=env["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"], region_name="auto",
    config=Config(signature_version="s3v4", retries={"max_attempts": 3}))
BUCKET = env["R2_BUCKET"]


def normalize_lines(lines):
    """Coerce to [{voice, text}] with a valid voice key; default to narrator."""
    out = []
    for ln in lines:
        text = (ln.get("text") or "").strip()
        if not text:
            continue
        voice = ln.get("voice")
        if voice not in VOICES:
            voice = "narrator"
        out.append({"voice": voice, "text": text})
    return out


def audio_key(lines):
    norm = [{"voice": ln["voice"], "text": ln["text"]} for ln in normalize_lines(lines)]
    payload = json.dumps(norm, ensure_ascii=False, separators=(",", ":"))
    h = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}/{h}.mp3"


async def _edge_one(text, voice_key):
    voice = VOICES[voice_key]
    for attempt in range(MAX_RETRY):
        try:
            comm = edge_tts.Communicate(text, voice, rate=RATE)
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


def render_turn(text, voice_key):
    """Sync wrapper: mp3 bytes for one turn, or None."""
    return asyncio.run(_edge_one(text, voice_key))


def build_clip_bytes(lines):
    """Render every turn and concatenate to one mp3. Returns bytes or None."""
    norm = normalize_lines(lines)
    if not norm:
        return None
    rendered = []
    for ln in norm:
        b = render_turn(ln["text"], ln["voice"])
        if not b:
            return None
        rendered.append(b)
    if len(rendered) == 1:
        return rendered[0]
    with tempfile.TemporaryDirectory() as td:
        paths = []
        for i, b in enumerate(rendered):
            p = os.path.join(td, f"t{i}.mp3")
            with open(p, "wb") as fh:
                fh.write(b)
            paths.append(p)
        out = os.path.join(td, "out.mp3")
        # Simpler + robust: concat demuxer with a silence file between turns, re-encoded.
        sil = os.path.join(td, "sil.mp3")
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=r=24000:cl=mono",
                        "-t", str(GAP_MS / 1000.0), "-c:a", "libmp3lame", "-b:a", "48k", sil],
                       capture_output=True, check=True)
        listfile = os.path.join(td, "list.txt")
        with open(listfile, "w", encoding="utf-8") as fh:
            for i, p in enumerate(paths):
                fh.write(f"file '{p}'\n")
                if i < len(paths) - 1:
                    fh.write(f"file '{sil}'\n")
        r = subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile,
                            "-c:a", "libmp3lame", "-b:a", "48k", out], capture_output=True)
        if r.returncode != 0:
            return None
        with open(out, "rb") as fh:
            return fh.read()


def persist_clip(key, audio_bytes, overwrite=False):
    if not overwrite:
        try:
            s3.head_object(Bucket=BUCKET, Key=key)
            return "skip"
        except Exception:
            pass
    try:
        s3.put_object(Bucket=BUCKET, Key=key, Body=audio_bytes, ContentType="audio/mpeg",
                      CacheControl="public, max-age=31536000, immutable", Metadata={"engine": "edge-multi"})
        return "ok"
    except Exception:
        return "fail"


def build_and_persist(lines, overwrite=False):
    """Full path: key -> (skip if present) -> render+concat -> R2. Returns (key, status)."""
    key = audio_key(lines)
    if not overwrite:
        try:
            s3.head_object(Bucket=BUCKET, Key=key)
            return key, "skip"
        except Exception:
            pass
    audio = build_clip_bytes(lines)
    if not audio:
        return key, "fail"
    return key, persist_clip(key, audio, overwrite=True)


if __name__ == "__main__":
    lines = [
        {"speaker": "女", "voice": "female", "text": "你好！很高兴认识你。"},
        {"speaker": "男", "voice": "male", "text": "你好，我也很高兴认识你。你叫什么名字？"},
        {"speaker": "女", "voice": "female", "text": "我叫小美，我们是同学。"},
    ]
    key = audio_key(lines)
    print("key:", key)
    audio = build_clip_bytes(lines)
    if not audio:
        print("BUILD FAILED")
        raise SystemExit(1)
    out = os.path.join(ROOT, "..", "_build", "listen_smoke.mp3")
    with open(out, "wb") as fh:
        fh.write(audio)
    print(f"built {len(audio)} bytes -> {out}")
    # objective checks: duration + loudness (we can't hear it; verify it's not silent)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", out], capture_output=True, text=True).stdout.strip()
    vol = subprocess.run(["ffmpeg", "-i", out, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    mean = re.search(r"mean_volume:\s*(-?[\d.]+) dB", vol)
    mx = re.search(r"max_volume:\s*(-?[\d.]+) dB", vol)
    print(f"duration={dur}s mean_volume={mean.group(1) if mean else '?'}dB max_volume={mx.group(1) if mx else '?'}dB")
