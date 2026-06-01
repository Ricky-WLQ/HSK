# -*- coding: utf-8 -*-
"""Generate the deferred HSK1/HSK2 READING Part-1 image-match sets (阅读第一部分):
5 printed sentences + a 6-picture bank (A-F); match each sentence to its picture
(one picture is an unused distractor). Reuses the verified image pipeline
(scripts/imagegen.py). No audio. Completes the reading section.

DeepSeek returns STRICT JSON:
  {"instruction":"...",
   "sharedImages":{"A":"<english scene>",... 6 letters},
   "items":[{"sentence":"<中文句子>","picture":"<A-F it matches>","explanation":"<中文解析>"},... 5]}

QA gates: structural, scene-match solver self-consistency (sentence<->scene, text-
based), jieba vocab, answer-letter shuffle (anti-sequential), pypinyin for HSK1-2.
Usage: python scripts/generate-reading-images.py --per 20
"""
import glob
import hashlib
import json
import os
import random
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import jieba
from pypinyin import pinyin as _pinyin, Style

from reading_specs import cumulative_vocab
import imagegen as IG

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRACTICE = os.path.join(ROOT, "src", "data", "practice")
env = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')
KEY = env["DEEPSEEK_API_KEY"]
MODEL = env.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
LETTERS = "ABCDEF"
MINVOCAB = {"1": 0.70, "2": 0.74}

SPECS = [
    {"level": "1", "titleZh": "阅读 第一部分（看图选句）",
     "prompt": "Write an HSK1 reading image-match group: 5 short Chinese sentences (HSK1 vocabulary ~150 words, "
     "4-8 characters), each describing a single concrete everyday object or ACTION, plus one unused distractor scene."},
    {"level": "2", "titleZh": "阅读 第一部分（看图选句）",
     "prompt": "Write an HSK2 reading image-match group: 5 short Chinese sentences (HSK2 vocabulary ~300 words, "
     "≤12 characters), each describing a single concrete everyday object or ACTION, plus one unused distractor scene."},
]
SCHEMA = (
    ' Return STRICT JSON: {"instruction":"<中文 directions>","items":[{"sentence":"<中文句子>",'
    '"scene":"<english scene that CLEARLY depicts that exact sentence — include the subject (man/woman/child/animal) '
    'AND the action being performed, e.g. \'a boy eating a red apple\' for 我吃苹果>","explanation":"<中文解析>"},'
    '... 5 items],"distractorScene":"<english scene, plausible but matching none of the 5 sentences>"}. '
    "Every scene depicts a SINGLE subject+action drawable WITHOUT any text, letters, numbers, or signs."
)


def deepseek(system, user, temperature=0.7, max_retries=4):
    body = json.dumps({"model": MODEL, "messages": [{"role": "system", "content": system},
        {"role": "user", "content": user}], "response_format": {"type": "json_object"},
        "temperature": temperature, "stream": False}).encode("utf-8")
    last = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=body,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            return json.loads(json.load(urllib.request.urlopen(req, timeout=120))["choices"][0]["message"]["content"])
        except Exception as e:
            last = repr(e); time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("deepseek failed: " + str(last))


def _py(text):
    return " ".join(p[0] for p in _pinyin(text, style=Style.TONE)) if text else ""


def _img_key_id(desc):
    return "scene-" + hashlib.sha256(desc.strip().encode("utf-8")).hexdigest()[:32]


def gen_correct_image(sentence, scene):
    """Generate an image for `scene` and confirm (via VLM) it actually depicts `sentence`;
    regenerate with growing emphasis on a fresh key until it matches. Retrying ONE image
    is far cheaper than retrying the whole 6-image set, so try several times here."""
    emph = [
        scene,
        scene + " — clearly show the subject performing this exact action",
        scene + " — a single clear subject actively performing the action, full scene",
        scene + " — unambiguous depiction of the subject and the action, nothing else",
    ]
    for attempt in range(4):
        kid = "scene-" + hashlib.sha256(f"{scene}|v{attempt}".encode("utf-8")).hexdigest()[:32]
        r = IG.make_image(kid, emph[attempt])
        if r["status"] == "fail":
            continue
        b = r.get("bytes") or IG.get_image_bytes(r["key"])
        if b and IG.vlm_yesno(b, f"这张图片表现的是不是这句话的内容：「{sentence}」？"):
            return r["key"]
    return None


def build_group(level, data, set_id):
    items = data.get("items", [])
    if len(items) != 5:
        raise RuntimeError(f"need 5 items, got {len(items)}")
    distractor = (data.get("distractorScene") or "").strip()
    if not distractor:
        raise RuntimeError("need distractorScene")
    # one VLM-verified picture per sentence + one distractor; letters A-E (sentences) / F (distractor)
    entries = []  # (sentence|None, key, explanation|None)
    for it in items:
        sent = (it.get("sentence") or "").strip()
        scene = (it.get("scene") or "").strip()
        if not sent or not scene:
            raise RuntimeError("missing sentence/scene")
        key = gen_correct_image(sent, scene)
        if not key:
            raise RuntimeError(f"no image matching: {sent}")
        entries.append((sent, key, it.get("explanation", "")))
    dk = IG.make_image(_img_key_id(distractor), distractor)
    if dk["status"] == "fail":
        raise RuntimeError("distractor image fail")
    entries.append((None, dk["key"], None))

    bank, questions = [], []
    for idx, (_sent, key, _ex) in enumerate(entries):
        bank.append({"label": LETTERS[idx], "text": "", "imageUrl": "/api/practice-image?key=" + key})
    for i, (sent, _key, expl) in enumerate(entries[:5], 1):
        q = {"id": f"q{i}", "type": "image-match", "prompt": sent,
             "correctAnswer": LETTERS[i - 1], "explanation": expl}
        if level in ("1", "2"):
            q["pinyin"] = _py(sent)
        questions.append(q)
    return {"id": "g1", "instruction": data.get("instruction", ""), "sharedBank": bank, "questions": questions}


def shuffle_letters(group):
    """Relabel the picture bank so the correct answers are NOT A,B,C,D,E in order."""
    bank = group["sharedBank"]
    keys = [q["correctAnswer"] for q in group["questions"]]
    for _ in range(25):
        perm = list(range(len(bank)))
        random.shuffle(perm)
        mapping = {bank[old]["label"]: LETTERS[new] for new, old in enumerate(perm)}
        new_keys = [mapping[k] for k in keys]
        seq = new_keys == sorted(new_keys)
        if not seq and new_keys != keys:
            new_bank = []
            for old_i, p in enumerate(perm):
                o = dict(bank[p]); o["label"] = LETTERS[old_i]; new_bank.append(o)
            new_bank.sort(key=lambda o: o["label"])
            group["sharedBank"] = new_bank
            for q in group["questions"]:
                q["correctAnswer"] = mapping[q["correctAnswer"]]
            return


def validate(group):
    problems = []
    if len(group.get("sharedBank", [])) != 6:
        problems.append("bank != 6")
    if len(group["questions"]) != 5:
        problems.append("questions != 5")
    for q in group["questions"]:
        if q["correctAnswer"] not in LETTERS:
            problems.append(f"{q['id']}: bad answer")
        if not q.get("prompt"):
            problems.append(f"{q['id']}: empty sentence")
    return problems


def vocab_ratio(group, allowed, allowed_chars):
    texts = [q["prompt"] for q in group["questions"]]
    words = [w for w in jieba.cut(" ".join(texts)) if re.search(r"[一-鿿]", w)]
    if not words:
        return 1.0
    def ok(w):
        return w in allowed or all((c in allowed_chars) for c in w if re.search(r"[一-鿿]", c))
    return sum(1 for w in words if ok(w)) / len(words)


def gen_set(level, spec, set_id, allowed, allowed_chars):
    sysp = (f"You are a precise HSK{level} reading item writer. Reply STRICT JSON. Use ONLY HSK{level} vocabulary. "
            "解析(explanation)里不要出现选项字母。")
    for attempt in range(3):
        try:
            data = deepseek(sysp, spec["prompt"] + SCHEMA, temperature=0.7 + 0.1 * attempt)
            group = build_group(level, data, set_id)  # VLM-grounds every sentence→image
        except Exception as e:
            print(f"    [{set_id} a{attempt}] gen/parse: {repr(e)[:80]}", flush=True)
            continue
        probs = validate(group)
        if probs:
            print(f"    [{set_id} a{attempt}] structural: {probs[:2]}", flush=True); continue
        vr = vocab_ratio(group, allowed, allowed_chars)
        if vr < MINVOCAB.get(level, 0.7):
            print(f"    [{set_id} a{attempt}] vocab {vr:.2f}", flush=True); continue
        shuffle_letters(group)
        return group
    return None


def rebuild_index():
    sets = []
    for f in glob.glob(os.path.join(PRACTICE, "**", "*.json"), recursive=True):
        if f.endswith("index.json"):
            continue
        try:
            s = json.load(open(f, encoding="utf-8"))
            sets.append({"id": s["id"], "level": s["level"], "section": s["section"], "partKey": s["partKey"],
                         "title": s["title"], "titleZh": s["titleZh"],
                         "questionCount": sum(len(g["questions"]) for g in s["groups"])})
        except Exception:
            pass
    sets.sort(key=lambda s: (s["section"], s["id"]))
    json.dump({"generated": datetime.now(timezone.utc).isoformat(), "sets": sets},
              open(os.path.join(PRACTICE, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return len(sets)


def main():
    args = sys.argv[1:]
    per = 20
    if "--per" in args:
        i = args.index("--per"); per = int(args[i + 1])
    vocab_cache = {s["level"]: cumulative_vocab(s["level"], ROOT) for s in SPECS}
    tasks = []
    for spec in SPECS:
        for i in range(1, per + 1):
            tasks.append((f"hsk{spec['level']}-reading-p1{i:02d}", spec))
    print(f"generating {len(tasks)} reading image-match sets ...", flush=True)

    def work(task):
        set_id, spec = task
        level = spec["level"]
        path = os.path.join(PRACTICE, f"hsk{level}", "reading", set_id + ".json")
        if os.path.exists(path):
            return ("skip", set_id, spec, None)
        words, chars = vocab_cache[level]
        return ("done", set_id, spec, gen_set(level, spec, set_id, words, chars))

    new = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for fut in as_completed([ex.submit(work, t) for t in tasks]):
            st, set_id, spec, group = fut.result()
            if st == "skip" or group is None:
                if group is None and st != "skip":
                    print(f"  ! {set_id} failed QA", flush=True)
                continue
            level = spec["level"]
            outdir = os.path.join(PRACTICE, f"hsk{level}", "reading")
            pset = {"id": set_id, "level": level, "section": "reading", "partKey": "reading-p1",
                    "title": f"HSK{level} Reading P1", "titleZh": spec["titleZh"], "groups": [group],
                    "source": "AI-generated (DeepSeek + SiliconFlow), HSK 3.0 new format"}
            json.dump(pset, open(os.path.join(outdir, set_id + ".json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            new += 1
    total = rebuild_index()
    print(f"DONE. {new} new sets; index now has {total} total.", flush=True)


if __name__ == "__main__":
    main()
