"""
Reusable image-generation module for HSK picture items (reading image-match +
listening picture parts). Content generators import make_image(); a CLI mode
lets you smoke one prompt end-to-end.

Pipeline per image:
  1. GENERATE via a model waterfall (SiliconFlow /v1/images/generations):
       baidu/ERNIE-Image-Turbo -> Tongyi-MAI/Z-Image-Turbo -> Qwen/Qwen-Image.
     English prompt + a fixed flat-illustration style anchor + a no-text
     negative prompt (HSK pictures must carry meaning in the drawing, not words).
  2. OCR-REJECT: a vision model (Qwen/Qwen3-VL-8B-Instruct) answers YES/NO to
     "does this image contain readable text". Any YES -> reject + retry / next model.
  3. PERSIST: download the temporary SiliconFlow URL (these expire ~1h) and upload
     the bytes to Cloudflare R2 under images/v1/{key}.png (idempotent via head_object).

Reads SILICONFLOW_API_KEY + R2_* from .env (gitignored). Same R2 client as
pregenerate-tts.py.
"""
import base64
import json
import os
import sys
import threading
import time
import urllib.request

import boto3
from botocore.config import Config

# Global cap on concurrent image-generation calls. The content generator runs many
# worker threads; without this, image-heavy sets fire dozens of simultaneous requests
# and SiliconFlow's image rate limit (plus flaky China-side connectivity) returns read
# timeouts. Throttling to a few in-flight requests makes generation slow-but-reliable.
IMG_SEM = threading.Semaphore(3)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')

KEY = env["SILICONFLOW_API_KEY"]
BASE = "https://api.siliconflow.cn/v1"
# Waterfall: Z-Image-Turbo first — it's on SiliconFlow's own reliable host and produces
# clean text-free HSK illustrations. ERNIE (best quality but flaky third-party endpoint:
# frequent timeouts + HTTP 451) is demoted to a fallback. Answer correctness is
# VLM-grounded, so the model choice doesn't affect the key — only image style/reliability.
MODELS = ["Tongyi-MAI/Z-Image-Turbo", "baidu/ERNIE-Image-Turbo", "Qwen/Qwen-Image"]
VLM = "Qwen/Qwen3-VL-8B-Instruct"  # OCR-reject judge
KEY_PREFIX = "images/v1"

# Fixed style anchor for a cohesive HSK picture bank: simple flat vector look, no text.
STYLE = (
    "simple clean flat vector illustration, children's textbook style, bright flat colors, "
    "minimal, centered subject, plain solid white background, no text, no words, no letters, no captions"
)
NEG = (
    "text, words, letters, captions, labels, watermark, signature, logo, numbers, "
    "chinese characters, writing, subtitles, ugly, blurry, distorted, extra limbs"
)

s3 = boto3.client(
    "s3", endpoint_url=env["R2_ENDPOINT"], aws_access_key_id=env["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"], region_name="auto",
    config=Config(signature_version="s3v4", retries={"max_attempts": 3}))
BUCKET = env["R2_BUCKET"]


def r2_image_key(key_id):
    return f"{KEY_PREFIX}/{key_id}.png"


def _post(path, body, timeout):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        BASE + path, data=data,
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def _generate(model, prompt, seed=None, size="1024x1024"):
    """Return PNG bytes from one model, or None on failure. Throttled by IMG_SEM and
    retried on transient timeouts (the API/connection is flaky under load)."""
    body = {
        "model": model, "prompt": f"{prompt}. {STYLE}", "negative_prompt": NEG,
        "image_size": size, "batch_size": 1, "num_inference_steps": 20,
    }
    if seed is not None:
        body["seed"] = seed
    for attempt in range(2):
        try:
            with IMG_SEM:
                d = _post("/images/generations", body, timeout=180)
                url = (d.get("images") or d.get("data") or [{}])[0].get("url")
                if not url:
                    return None
                return urllib.request.urlopen(url, timeout=120).read()
        except Exception as e:
            if attempt == 0:
                time.sleep(3.0)
                continue
            print(f"    gen fail [{model}]: {repr(e)[:120]}", flush=True)
            return None


def _vlm(image_bytes, question, default=""):
    """Ask the vision model a question about an image; return its raw uppercased text."""
    data_url = "data:image/png;base64," + base64.b64encode(image_bytes).decode()
    body = {
        "model": VLM, "temperature": 0.0, "max_tokens": 8,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": question},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }],
    }
    for attempt in range(3):
        try:
            d = _post("/chat/completions", body, timeout=60)
            return d["choices"][0]["message"]["content"].strip().upper()
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return default


def has_text(image_bytes):
    """True if the vision model detects readable text in the image (OCR-reject)."""
    ans = _vlm(image_bytes,
               "Does this image contain ANY readable text, letters, words, numbers, "
               "or written characters anywhere in it? Answer with exactly one word: YES or NO.")
    return ans.startswith("YES")


def vlm_yesno(image_bytes, question):
    """Ground-truth image check (e.g. 'does this picture show three apples?'). True=YES."""
    ans = _vlm(image_bytes, question + " Answer with exactly one word: YES or NO.")
    return ans.startswith("YES")


def get_image_bytes(key):
    """Fetch a stored image's bytes from R2 (for re-checking an idempotently-skipped image)."""
    try:
        return s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    except Exception:
        return None


def make_image(key_id, prompt, seed=None, size="1024x1024", overwrite=False, local_copy=None):
    """Generate one text-free image for `prompt` and persist to R2 at images/v1/{key_id}.png.
    Idempotent (skips if present unless overwrite). Returns dict with status."""
    key = r2_image_key(key_id)
    if not overwrite:
        try:
            s3.head_object(Bucket=BUCKET, Key=key)
            return {"status": "skip", "key": key}
        except Exception:
            pass
    for model in MODELS:
        for attempt in range(2):  # 2 tries per model before falling through the waterfall
            img = _generate(model, prompt, seed=seed, size=size)
            if not img:
                continue
            if has_text(img):
                print(f"    OCR-reject [{model}] attempt {attempt} for {key_id}", flush=True)
                continue
            try:
                s3.put_object(
                    Bucket=BUCKET, Key=key, Body=img, ContentType="image/png",
                    CacheControl="public, max-age=31536000, immutable",
                    Metadata={"model": model.split("/")[-1]})
            except Exception as e:
                return {"status": "fail", "key": key, "error": f"r2 put: {repr(e)[:100]}"}
            if local_copy:
                with open(local_copy, "wb") as fh:
                    fh.write(img)
            return {"status": "ok", "key": key, "model": model, "bytes": img}
    return {"status": "fail", "key": key, "error": "all models failed or produced text"}


if __name__ == "__main__":
    # CLI smoke:  python scripts/imagegen.py "three red apples on a table" smoke-test
    prompt = sys.argv[1] if len(sys.argv) > 1 else "three red apples on a wooden table"
    key_id = sys.argv[2] if len(sys.argv) > 2 else "smoke-test"
    local = os.path.join(ROOT, "..", "_build", f"img_{key_id}.png")
    r = make_image(key_id, prompt, overwrite=True, local_copy=local)
    print(json.dumps(r, ensure_ascii=False))
    if r["status"] == "ok":
        # verify round-trip from R2
        got = s3.get_object(Bucket=BUCKET, Key=r["key"])["Body"].read()
        print(f"R2 round-trip OK: {len(got)} bytes at {r['key']}; local copy {local}")
