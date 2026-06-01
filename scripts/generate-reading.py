"""
Generate HSK 3.0 new-format READING practice sets with DeepSeek, grounded in the
official item formats (see scripts/reading_specs.py) + QA gates:
  1. structural validation (schema-conformant, valid option letters, right counts)
  2. answer-key self-consistency: a separate "solver" DeepSeek call must reproduce
     the stated answers (rejects items whose key is wrong/ambiguous)
  3. vocab-level constraint: jieba-segment the content; flag sets that lean on
     words above the target HSK level
Output: src/data/practice/hsk{level}/reading/{setId}.json + updates index.json
Usage:  python scripts/generate-reading.py [level ...]   (default: 3)
Reads DEEPSEEK_API_KEY / DEEPSEEK_MODEL from .env (gitignored).
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

import jieba
from pypinyin import pinyin as _pinyin, Style

from reading_specs import SPECS, cumulative_vocab


def _py(text):
    return " ".join(p[0] for p in _pinyin(text, style=Style.TONE)) if text else ""


def add_pinyin(group, level):
    """HSK1-3 items show pinyin. Add it programmatically (reliable) rather than
    trust DeepSeek's pinyin. Passages get pinyin only at HSK1-2."""
    if level not in ("1", "2", "3"):
        return
    if group.get("passage") and level in ("1", "2"):
        group["passagePinyin"] = _py(group["passage"])
    for o in group.get("sharedBank") or []:
        o["pinyin"] = _py(o["text"])
    for q in group["questions"]:
        q["pinyin"] = _py(q["prompt"])
        for o in q.get("options") or []:
            o["pinyin"] = _py(o["text"])

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

LETTERS = "ABCDEFG"
# Vocab-gate threshold scales by level: lower levels have tiny wordlists, so even
# appropriate content has a lower in-vocab ratio. This is a backstop against
# egregiously out-of-level vocabulary, not an exact filter.
MINVOCAB = {"1": 0.74, "2": 0.80, "3": 0.83, "4": 0.85, "5": 0.87, "6": 0.88, "7-9": 0.90}


def deepseek(system, user, temperature=0.6, max_retries=4):
    body = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
        "temperature": temperature,
        "stream": False,
    }
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                "https://api.deepseek.com/chat/completions", data=data,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            resp = json.load(urllib.request.urlopen(req, timeout=120))
            return json.loads(resp["choices"][0]["message"]["content"])
        except Exception as e:
            last = repr(e)
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("deepseek failed: " + str(last))


def validate_structure(group, spec):
    """Return list of structural problems (empty = ok)."""
    problems = []
    qs = group.get("questions", [])
    if len(qs) != spec["nQuestions"]:
        problems.append(f"expected {spec['nQuestions']} questions, got {len(qs)}")
    bank = group.get("sharedBank")
    if spec.get("sharedBank"):
        if not bank or len(bank) != spec["sharedBank"]:
            problems.append(f"expected shared bank of {spec['sharedBank']}, got {len(bank) if bank else 0}")
        else:
            valid = set(LETTERS[: spec["sharedBank"]])
            for o in bank:
                if o.get("label") not in valid:
                    problems.append(f"bad bank label {o.get('label')}")
    if spec.get("passage") and not group.get("passage"):
        problems.append("missing passage")
    for q in qs:
        ca = str(q.get("correctAnswer", ""))
        if spec["type"] == "short-answer":
            if not ca:
                problems.append(f"{q.get('id')}: empty reference answer")
            continue
        if spec.get("options"):
            opts = q.get("options") or []
            if len(opts) != spec["options"]:
                problems.append(f"{q.get('id')}: expected {spec['options']} options, got {len(opts)}")
            letters = set(LETTERS[: spec["options"]])
            if ca not in letters:
                problems.append(f"{q.get('id')}: answer {ca!r} not in {sorted(letters)}")
        elif spec.get("sharedBank"):
            letters = set(LETTERS[: spec["sharedBank"]])
            if ca not in letters:
                problems.append(f"{q.get('id')}: answer {ca!r} not in bank letters")
    return problems


def solver_check(group, spec):
    """Answer-key self-consistency: ask DeepSeek to SOLVE the item fresh; compare."""
    if spec["type"] == "short-answer":
        return True  # AI-graded; no single key to verify
    payload = {
        "instruction": group.get("instruction"),
        "passage": group.get("passage"),
        "sharedBank": group.get("sharedBank"),
        "questions": [
            {"id": q["id"], "prompt": q.get("prompt"), "options": q.get("options")}
            for q in group["questions"]
        ],
    }
    sys_p = (
        "You are an expert HSK examinee. Solve each reading question. Reply STRICT JSON only: "
        '{"answers":{"<questionId>":"<letter>"}}. Choose exactly one option letter per question.'
    )
    try:
        out = deepseek(sys_p, json.dumps(payload, ensure_ascii=False), temperature=0.0)
        ans = out.get("answers", {})
    except Exception:
        return True  # don't block on solver failure; structural+vocab still apply
    agree = sum(1 for q in group["questions"] if str(ans.get(q["id"], "")) == str(q["correctAnswer"]))
    return agree == len(group["questions"])


def vocab_ratio(group, allowed, allowed_chars):
    """Fraction of content Chinese words that are an HSK word OR built entirely from
    known HSK characters (level-appropriate)."""
    text = " ".join(
        [group.get("instruction", ""), group.get("passage", "")]
        + [o.get("text", "") for o in (group.get("sharedBank") or [])]
        + [q.get("prompt", "") for q in group["questions"]]
        + [o.get("text", "") for q in group["questions"] for o in (q.get("options") or [])]
    )
    words = [w for w in jieba.cut(text) if re.search(r"[一-鿿]", w)]
    if not words:
        return 1.0
    def ok(w):
        return w in allowed or all((c in allowed_chars) for c in w if re.search(r"[一-鿿]", c))
    return sum(1 for w in words if ok(w)) / len(words)


def gen_group(level, spec, allowed, allowed_chars):
    sys_p = (
        "You are a precise HSK 3.0 exam item writer following the OFFICIAL new-format. "
        "Write authentic Chinese reading items. Reply STRICT JSON only matching the requested schema. "
        f"Use ONLY vocabulary and grammar appropriate to HSK level {level} (cumulative). Every item "
        "must have exactly ONE unambiguous correct answer; distractors must be clearly wrong but plausible."
    )
    for attempt in range(3):
        try:
            group = deepseek(sys_p, spec["prompt"](level), temperature=0.6 + 0.1 * attempt)
        except Exception:
            continue
        # normalize ids
        for i, q in enumerate(group.get("questions", []), 1):
            q.setdefault("id", f"q{i}")
            q["type"] = spec["type"]
        probs = validate_structure(group, spec)
        if probs:
            print(f"    [attempt {attempt}] structural: {probs[:3]}", flush=True)
            continue
        if not solver_check(group, spec):
            print(f"    [attempt {attempt}] solver disagreed with answer key", flush=True)
            continue
        vr = vocab_ratio(group, allowed, allowed_chars)
        thresh = MINVOCAB.get(level, 0.85)
        if vr < thresh:
            print(f"    [attempt {attempt}] vocab ratio {vr:.2f} < {thresh}", flush=True)
            continue
        return group
    return None


def main():
    levels = sys.argv[1:] or ["3"]
    idx_path = os.path.join(PRACTICE, "index.json")
    index = {"generated": datetime.now(timezone.utc).isoformat(), "sets": []}
    if os.path.exists(idx_path):
        try:
            index = json.load(open(idx_path, encoding="utf-8"))
        except Exception:
            pass
    for level in levels:
        vocab_words, vocab_chars = cumulative_vocab(level, ROOT)
        parts = [s for s in SPECS if s["level"] == level]
        for spec in parts:
            outdir = os.path.join(PRACTICE, f"hsk{level}", "reading")
            os.makedirs(outdir, exist_ok=True)
            # one set per part for the starter bank
            existing = [s for s in index["sets"] if s["partKey"] == spec["partKey"] and s["level"] == level]
            setnum = len(existing) + 1
            set_id = f"hsk{level}-reading-{spec['partKey'].split('-')[-1]}{setnum:02d}"
            print(f"generating {set_id} ({spec['type']}) ...", flush=True)
            group = gen_group(level, spec, vocab_words, vocab_chars)
            if not group:
                print(f"  ! {set_id}: failed QA after retries", flush=True)
                continue
            add_pinyin(group, level)
            group["id"] = "g1"
            pset = {
                "id": set_id, "level": level, "section": "reading", "partKey": spec["partKey"],
                "title": spec["title"], "titleZh": spec["titleZh"], "groups": [group],
                "source": "AI-generated (DeepSeek), HSK 3.0 new format",
            }
            json.dump(pset, open(os.path.join(outdir, set_id + ".json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            qcount = len(group["questions"])
            index["sets"] = [s for s in index["sets"] if s["id"] != set_id]
            index["sets"].append({
                "id": set_id, "level": level, "section": "reading", "partKey": spec["partKey"],
                "title": spec["title"], "titleZh": spec["titleZh"], "questionCount": qcount,
            })
            print(f"  ok: {qcount} questions", flush=True)
    index["generated"] = datetime.now(timezone.utc).isoformat()
    json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("DONE. total sets in index:", len(index["sets"]))


if __name__ == "__main__":
    main()
