# -*- coding: utf-8 -*-
"""Post-hoc audit of the generated LISTENING bank:
  - per-part counts
  - every question is playable (has group or per-item audio key)
  - picture parts carry images (pic-tf: per-question imageUrl; pic-match: 6-image bank)
  - answer distribution + strictly-sequential mcq detection
  - 对/错 balance for true/false parts
  - explanations cite NO option letters
  - SAMPLE: audio keys resolve in R2 and are non-silent; image keys resolve in R2
  - SAMPLE: fresh DeepSeek transcript-solve agrees with the stored key (mcq + statement-tf)
Usage: python scripts/audit-listening.py [sampleN]
"""
import collections
import glob
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.config import Config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
KEY = env["DEEPSEEK_API_KEY"]
MODEL = env.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
LETTER_CITE = re.compile(
    r"[选答][:：]?\s*[ABCDEFG]\b|答案[是为]?\s*[ABCDEFG]\b|[（(]\s*[ABCDEFG]\s*[)）]|[ABCDEFG]\s*项|正确答案.{0,4}[ABCDEFG]"
)
s3 = boto3.client("s3", endpoint_url=env["R2_ENDPOINT"], aws_access_key_id=env["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"], region_name="auto",
    config=Config(signature_version="s3v4"))
BUCKET = env["R2_BUCKET"]


def deepseek(system, user):
    body = json.dumps({"model": MODEL, "messages": [{"role": "system", "content": system},
        {"role": "user", "content": user}], "response_format": {"type": "json_object"},
        "temperature": 0.0, "stream": False}).encode("utf-8")
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=body,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            return json.loads(json.load(urllib.request.urlopen(req, timeout=90))["choices"][0]["message"]["content"])
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return {}


def r2_exists(key):
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except Exception:
        return False


def audio_nonsilent(key):
    try:
        b = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    except Exception:
        return None
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as fh:
        fh.write(b); p = fh.name
    try:
        vol = subprocess.run(["ffmpeg", "-i", p, "-af", "volumedetect", "-f", "null", "-"],
                             capture_output=True, text=True).stderr
        m = re.search(r"max_volume:\s*(-?[\d.]+) dB", vol)
        return float(m.group(1)) if m else None
    finally:
        os.unlink(p)


PIC_TF = "listening-picture-true-false"
PIC_MATCH = "listening-picture-match"


def labeled(audio):
    """Transcript WITH speaker labels (男：…/女：…) so 'what did the man say' is answerable."""
    if not audio:
        return ""
    return "\n".join(f"{l.get('speaker') or '旁白'}：{l['text']}" for l in audio.get("lines", []))


def resolve_set(path):
    """Fresh transcript-solve vs stored key for mcq + statement-tf groups. The transcript
    includes speaker labels so dialogue 男/女 attribution questions are answerable."""
    s = json.load(open(path, encoding="utf-8"))
    g = s["groups"][0]
    types = {q["type"] for q in g["questions"]}
    if types & {PIC_TF, PIC_MATCH, "listening-dictation"}:
        return None  # image-grounded / no single textual key
    payload = {"instruction": g.get("instruction")}
    if g.get("audio"):
        payload["transcript"] = labeled(g["audio"])
        payload["questions"] = [{"id": q["id"], "prompt": q.get("prompt"), "options": q.get("options")}
                                for q in g["questions"]]
    else:
        payload["items"] = [{"id": q["id"], "transcript": labeled(q.get("audio")),
                             "prompt": q.get("prompt"), "options": q.get("options")} for q in g["questions"]]
    if "listening-statement-true-false" in types:
        sysp = 'Judge each statement vs the transcript. Reply STRICT JSON {"answers":{"<id>":"对"/"错"}}.'
    else:
        sysp = 'Solve each listening question from the transcript. Reply STRICT JSON {"answers":{"<id>":"<letter>"}}.'
    out = deepseek(sysp, json.dumps(payload, ensure_ascii=False))
    ans = out.get("answers", {})
    keys = {q["id"]: str(q["correctAnswer"]) for q in g["questions"]}
    agree = sum(1 for qid, k in keys.items() if str(ans.get(qid, "")) == k)
    return (s["id"], agree, len(keys))


def main():
    sampleN = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    files = sorted(glob.glob(os.path.join(ROOT, "src", "data", "practice", "**", "listening", "*.json"), recursive=True))
    by_part = collections.Counter()
    dist = collections.Counter()
    tf_balance = collections.Counter()
    seq = []
    no_audio = []
    no_image = []
    letter_cite = []
    audio_keys, image_keys = set(), set()
    for f in files:
        s = json.load(open(f, encoding="utf-8"))
        g = s["groups"][0]
        by_part[(s["level"], s["partKey"])] += 1
        typ = g["questions"][0]["type"]
        if g.get("audio"):
            audio_keys.add(g["audio"]["key"])
        mcq_keys = []
        for q in g["questions"]:
            if not (q.get("audio") or g.get("audio")):
                no_audio.append(f"{s['id']}/{q['id']}")
            if q.get("audio"):
                audio_keys.add(q["audio"]["key"])
            if LETTER_CITE.search(q.get("explanation", "")):
                letter_cite.append(f"{s['id']}/{q['id']}")
            if q["type"] == "listening-mcq":
                dist[q["correctAnswer"]] += 1
                mcq_keys.append(q["correctAnswer"])
            elif q["type"] in (PIC_TF, "listening-statement-true-false"):
                tf_balance[q["correctAnswer"]] += 1
            if q["type"] == PIC_TF:
                if not q.get("imageUrl"):
                    no_image.append(f"{s['id']}/{q['id']}")
                else:
                    image_keys.add(q["imageUrl"].split("key=", 1)[-1])
        if typ == PIC_MATCH:
            bank = g.get("sharedBank") or []
            if len(bank) != 6 or not all(o.get("imageUrl") for o in bank):
                no_image.append(f"{s['id']}/bank")
            for o in bank:
                if o.get("imageUrl"):
                    image_keys.add(o["imageUrl"].split("key=", 1)[-1])
        if typ == "listening-mcq" and mcq_keys == sorted(mcq_keys) and len(set(mcq_keys)) == len(mcq_keys) and len(mcq_keys) >= 4:
            seq.append(s["id"])

    print("total listening sets:", len(files))
    print("parts at 20:", sum(1 for v in by_part.values() if v == 20), "/", len(by_part))
    print("mcq answer distribution:", dict(sorted(dist.items())))
    print("对/错 balance:", dict(tf_balance))
    print("strictly-sequential mcq sets:", len(seq), seq[:5])
    print("questions missing audio:", len(no_audio), no_audio[:5])
    print("picture items missing image:", len(no_image), no_image[:5])
    print("explanations citing option letters:", len(letter_cite), letter_cite[:5])

    # R2 resolution sample
    random.seed(0)
    asamp = random.sample(sorted(audio_keys), min(20, len(audio_keys)))
    isamp = random.sample(sorted(image_keys), min(20, len(image_keys))) if image_keys else []
    a_missing = sum(1 for k in asamp if not r2_exists(k))
    i_missing = sum(1 for k in isamp if not r2_exists(k))
    vols = [audio_nonsilent(k) for k in asamp[:8]]
    vols = [v for v in vols if v is not None]
    print(f"\nR2 audio sample: {len(asamp)} checked, {a_missing} missing; "
          f"loudness max_volume range {min(vols):.1f}..{max(vols):.1f} dB" if vols else "no audio sampled")
    print(f"R2 image sample: {len(isamp)} checked, {i_missing} missing "
          f"(total unique images {len(image_keys)}, audio {len(audio_keys)})")

    # transcript re-solve sample
    solvable = [f for f in files if json.load(open(f, encoding="utf-8"))["groups"][0]["questions"][0]["type"]
                not in (PIC_TF, PIC_MATCH, "listening-dictation")]
    sample = random.sample(solvable, min(sampleN, len(solvable)))
    print(f"\nre-solving {len(sample)} sampled sets (transcript-solve vs stored key) ...")
    tq, ta, full = 0, 0, 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for fut in as_completed([ex.submit(resolve_set, f) for f in sample]):
            r = fut.result()
            if not r:
                continue
            _sid, agree, n = r
            tq += n; ta += agree
            if agree == n:
                full += 1
    print(f"re-solve agreement: {ta}/{tq} ({100*ta/max(1,tq):.1f}%) | {full}/{len(sample)} sets fully agree")


if __name__ == "__main__":
    main()
