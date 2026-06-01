# -*- coding: utf-8 -*-
"""Generate HSK WRITING (书写/写作) + TRANSLATION (翻译) practice sets.

Modes (see writing_specs.py): fill-char (auto-graded), sentence (picture+word, AI-graded),
essay (topic / 4-panel, AI-graded), translation (English→Chinese, AI-graded). Sentence +
4-panel images use the VLM-grounded image pipeline (scripts/imagegen.py).

Usage: python scripts/generate-writing.py --per 20 [--part 4:writing-p1 ...]
"""
import glob
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import jieba
from pypinyin import pinyin as _pinyin, Style

from writing_specs import SPECS, cumulative_vocab
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
HANZI = re.compile(r"[一-鿿]")


def deepseek(system, user, temperature=0.7, max_retries=4):
    body = json.dumps({"model": MODEL, "messages": [{"role": "system", "content": system},
        {"role": "user", "content": user}], "response_format": {"type": "json_object"},
        "temperature": temperature, "stream": False}).encode("utf-8")
    last = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=body,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            return json.loads(json.load(urllib.request.urlopen(req, timeout=150))["choices"][0]["message"]["content"])
        except Exception as e:
            last = repr(e); time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("deepseek failed: " + str(last))


def _py(text):
    return " ".join(p[0] for p in _pinyin(text, style=Style.TONE)) if text else ""


def _img_key_id(desc):
    return "scene-" + hashlib.sha256(desc.strip().encode("utf-8")).hexdigest()[:32]


def grounded_image(word_or_topic, scene):
    """Image for `scene`, VLM-checked to relate to `word_or_topic`; retry on a fresh key."""
    for attempt in range(3):
        kid = "scene-" + hashlib.sha256(f"{scene}|w{attempt}".encode("utf-8")).hexdigest()[:32]
        prompt = scene if attempt == 0 else scene + " — a clear, single, unambiguous everyday scene"
        r = IG.make_image(kid, prompt)
        if r["status"] == "fail":
            continue
        b = r.get("bytes") or IG.get_image_bytes(r["key"])
        if b and IG.vlm_yesno(b, f"这张图片的内容是不是和「{word_or_topic}」相关，并且可以用一句话描述？"):
            return r["key"]
    return None


def parse_group(level, spec, data):
    wtype = spec["wtype"]
    g = {"id": "g1", "instruction": data.get("instruction", ""), "questions": []}

    if wtype == "fill-char":
        for i, it in enumerate(data.get("items", []), 1):
            sent = (it.get("sentence") or "").strip()
            ch = (it.get("blank") or "").strip()
            py = (it.get("pinyin") or "").strip()
            if len(ch) != 1 or not HANZI.match(ch) or ch not in sent:
                raise RuntimeError(f"bad fill-char item: {ch!r}")
            prompt = sent.replace(ch, f"（{py}）", 1)
            q = {"id": f"q{i}", "type": "writing-fill-char", "prompt": prompt,
                 "correctAnswer": ch, "acceptableAnswers": [ch]}
            if level in ("2", "3"):
                q["pinyin"] = _py(sent)
            g["questions"].append(q)

    elif wtype == "sentence":
        for i, it in enumerate(data.get("items", []), 1):
            word = (it.get("word") or "").strip()
            scene = (it.get("scene") or "").strip()
            sample = (it.get("sample") or "").strip()
            if not word or not scene or not sample:
                raise RuntimeError("missing sentence fields")
            key = grounded_image(word, scene)
            if not key:
                raise RuntimeError(f"no image for: {word}")
            q = {"id": f"q{i}", "type": "writing-sentence", "prompt": "",
                 "givenWord": word, "imageUrl": "/api/practice-image?key=" + key,
                 "correctAnswer": sample, "sample": sample}
            g["questions"].append(q)

    elif wtype == "essay":
        sample = (data.get("sample") or "").strip()
        if not data.get("instruction") or not sample:
            raise RuntimeError("missing essay prompt/sample")
        q = {"id": "q1", "type": "writing-essay", "prompt": data["instruction"],
             "minChars": spec["minChars"], "correctAnswer": sample, "sample": sample}
        if spec["panels"]:
            panels = data.get("panels") or []
            if len(panels) != 4:
                raise RuntimeError("need 4 panels")
            urls = []
            for p in panels:
                r = IG.make_image(_img_key_id(str(p)), str(p))
                if r["status"] == "fail":
                    raise RuntimeError("panel image fail")
                urls.append("/api/practice-image?key=" + r["key"])
            q["images"] = urls
        g["questions"].append(q)

    elif wtype == "translation":
        passages = data.get("passages", [])
        if len(passages) != spec["nItems"]:
            raise RuntimeError(f"need {spec['nItems']} passages")
        for i, p in enumerate(passages, 1):
            src = (p.get("source") or "").strip()
            sample = (p.get("sample") or "").strip()
            if not src or not sample or len(HANZI.findall(src)) > 5:  # source must be English
                raise RuntimeError("bad translation passage")
            q = {"id": f"q{i}", "type": "translation-passage", "prompt": data.get("instruction", ""),
                 "sourceText": src, "correctAnswer": sample, "sample": sample}
            g["questions"].append(q)
    return g


def validate(group, spec):
    problems = []
    qs = group["questions"]
    if spec["wtype"] in ("fill-char", "sentence", "translation") and len(qs) != spec["nItems"]:
        problems.append(f"expected {spec['nItems']} items, got {len(qs)}")
    if spec["wtype"] == "essay":
        q = qs[0] if qs else {}
        if len(q.get("sample", "")) < int(spec["minChars"] * 0.8):
            problems.append(f"sample too short ({len(q.get('sample',''))} < {spec['minChars']})")
    return problems


def vocab_ratio(group, allowed, allowed_chars):
    texts = []
    for q in group["questions"]:
        texts += [q.get("prompt", ""), q.get("givenWord", ""), q.get("sample", "")]
    words = [w for w in jieba.cut(" ".join(texts)) if HANZI.search(w)]
    if not words:
        return 1.0
    def ok(w):
        return w in allowed or all((c in allowed_chars) for c in w if HANZI.search(c))
    return sum(1 for w in words if ok(w)) / len(words)


def gen_set(level, spec, allowed, allowed_chars):
    sysp = (f"You are a precise HSK{level} writing/translation item writer. Reply STRICT JSON. "
            f"Chinese content at HSK level {level}. Model answers are correct and natural.")
    for attempt in range(3):
        try:
            data = deepseek(sysp, spec["prompt"](level), temperature=0.7 + 0.1 * attempt)
            group = parse_group(level, spec, data)
        except Exception as e:
            print(f"    [a{attempt}] gen/parse: {repr(e)[:80]}", flush=True)
            continue
        probs = validate(group, spec)
        if probs:
            print(f"    [a{attempt}] structural: {probs[:2]}", flush=True); continue
        if spec["minVocab"] > 0:
            vr = vocab_ratio(group, allowed, allowed_chars)
            if vr < spec["minVocab"]:
                print(f"    [a{attempt}] vocab {vr:.2f} < {spec['minVocab']}", flush=True); continue
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
        i = args.index("--per"); per = int(args[i + 1]); args = args[:i] + args[i + 2:]
    part_filter = None
    if "--part" in args:
        i = args.index("--part"); part_filter = set(); j = i + 1
        while j < len(args) and ":" in args[j]:
            part_filter.add(args[j]); j += 1
        args = args[:i] + args[j:]
    vocab_cache = {s["level"]: cumulative_vocab(s["level"], ROOT) for s in SPECS}

    tasks = []
    for spec in SPECS:
        if part_filter and f"{spec['level']}:{spec['partKey']}" not in part_filter:
            continue
        section = "translation" if spec["wtype"] == "translation" else "writing"
        suffix = spec["partKey"].split("-")[-1]
        for i in range(1, per + 1):
            sid = f"hsk{spec['level']}-{section}-{suffix}{i:02d}"
            tasks.append((sid, section, spec))
    print(f"generating {len(tasks)} writing/translation sets ...", flush=True)

    def work(task):
        sid, section, spec = task
        path = os.path.join(PRACTICE, f"hsk{spec['level']}", section, sid + ".json")
        if os.path.exists(path):
            return ("skip", sid, section, spec, None)
        words, chars = vocab_cache[spec["level"]]
        return ("done", sid, section, spec, gen_set(spec["level"], spec, words, chars))

    new = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for fut in as_completed([ex.submit(work, t) for t in tasks]):
            st, sid, section, spec, group = fut.result()
            if st == "skip":
                continue
            if group is None:
                print(f"  ! {sid} failed QA", flush=True); continue
            outdir = os.path.join(PRACTICE, f"hsk{spec['level']}", section)
            os.makedirs(outdir, exist_ok=True)
            pset = {"id": sid, "level": spec["level"], "section": section, "partKey": spec["partKey"],
                    "title": f"HSK{spec['level']} {section.title()} {spec['partKey'].split('-')[-1].upper()}",
                    "titleZh": spec["titleZh"], "groups": [group],
                    "source": "AI-generated (DeepSeek + SiliconFlow), HSK 3.0 new format"}
            json.dump(pset, open(os.path.join(outdir, sid + ".json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            new += 1
    total = rebuild_index()
    print(f"DONE. {new} new sets; index now has {total} total.", flush=True)


if __name__ == "__main__":
    main()
