"""
Generate English definitions + one example sentence per HSK 3.0 vocab word
using DeepSeek (deepseek-v4-flash, JSON mode). Idempotent + resumable:
only fills words lacking a `definition`, saves incrementally.

Usage:  python scripts/generate-vocab-definitions.py [level ...]   (default: 1 2 3)
Reads DEEPSEEK_API_KEY / DEEPSEEK_MODEL from .env (gitignored).
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(ROOT, "src", "data", "vocab")

env = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')
KEY = env["DEEPSEEK_API_KEY"]
MODEL = env.get("DEEPSEEK_MODEL", "deepseek-v4-flash")

SYSTEM = (
    "You are a precise bilingual Chinese-English lexicographer creating HSK vocabulary "
    "flashcards. For the given Chinese word, reply with STRICT JSON only, no prose:\n"
    '{"definition":"<concise English gloss; separate distinct senses with \'; \'>",'
    '"examples":[{"hanzi":"<one short natural sentence using the word>",'
    '"pinyin":"<sentence pinyin with tone marks>","english":"<natural translation>"}]}\n'
    "Use exactly ONE example, level-appropriate, with simple vocabulary. Keep the "
    "definition under ~12 words."
)


def call(word):
    user = (
        f"Word: {word['hanzi']}\nPinyin: {word['pinyin']}\n"
        f"HSK level: {word['level']}\nPart of speech: {','.join(word.get('pos', []))}"
    )
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "stream": False,
    }
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                "https://api.deepseek.com/chat/completions",
                data=data,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
            )
            r = urllib.request.urlopen(req, timeout=90)
            resp = json.load(r)
            content = resp["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            if "definition" in parsed:
                return word["id"], parsed
            last = "no definition key"
        except Exception as e:  # noqa
            last = repr(e)
            time.sleep(1.5 * (attempt + 1))
    return word["id"], {"_error": last}


def process_level(level):
    path = os.path.join(VOCAB, f"hsk{level}.json")
    with open(path, encoding="utf-8") as f:
        words = json.load(f)
    by_id = {w["id"]: w for w in words}
    todo = [w for w in words if not w.get("definition")]
    if not todo:
        print(f"hsk{level}: already complete ({len(words)} words)")
        return
    print(f"hsk{level}: generating {len(todo)} / {len(words)} ...", flush=True)
    done = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(call, w): w for w in todo}
        for fut in as_completed(futures):
            wid, result = fut.result()
            if "_error" in result:
                print(f"  ! {wid}: {result['_error'][:80]}", flush=True)
            else:
                by_id[wid]["definition"] = result.get("definition", "")
                by_id[wid]["examples"] = result.get("examples", [])
            done += 1
            if done % 50 == 0:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(words, f, ensure_ascii=False, indent=1)
                print(f"  ...{done}/{len(todo)} (saved)", flush=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=1)
    missing = sum(1 for w in words if not w.get("definition"))
    print(f"hsk{level}: done. missing={missing}", flush=True)


if __name__ == "__main__":
    levels = sys.argv[1:] or ["1", "2", "3"]
    for lv in levels:
        process_level(lv)
    print("ALL DONE", flush=True)
