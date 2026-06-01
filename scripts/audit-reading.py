# -*- coding: utf-8 -*-
"""Post-hoc audit of the generated reading bank:
  - per-part set counts
  - answer-letter distribution + count of strictly-sequential match/cloze sets
  - duplicate passages/prompts
  - pinyin presence for HSK1-3
  - SAMPLE re-solve: a fresh DeepSeek solve must agree with the (shuffled) key
    (empirical proof the shuffle preserved correctness)
Usage: python scripts/audit-reading.py [sampleN]
"""
import collections
import glob
import json
import os
import random
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# Explanations must NOT cite option letters (they get shuffled → citations desync).
LETTER_CITE = re.compile(
    r"[选答][:：]?\s*[ABCDEFG]\b|答案[是为]?\s*[ABCDEFG]\b|[（(]\s*[ABCDEFG]\s*[)）]|[ABCDEFG]\s*项|正确答案.{0,4}[ABCDEFG]"
)
CLOZE_BLANK = re.compile(r"[（(][\s　]*[)）]|_{2,}|＿+")


def char_trigrams(s):
    s = re.sub(r"\s", "", s or "")
    return {s[i:i + 3] for i in range(max(0, len(s) - 2))}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
KEY = env["DEEPSEEK_API_KEY"]
MODEL = env.get("DEEPSEEK_MODEL", "deepseek-v4-flash")


def deepseek(system, user):
    body = json.dumps({
        "model": MODEL, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"}, "temperature": 0.0, "stream": False,
    }).encode("utf-8")
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=body,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            return json.loads(json.load(urllib.request.urlopen(req, timeout=90))["choices"][0]["message"]["content"])
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return {}


def resolve(set_path):
    s = json.load(open(set_path, encoding="utf-8"))
    g = s["groups"][0]
    if g["questions"][0]["type"] == "short-answer":
        return None  # AI-graded; skip
    payload = {
        "instruction": g.get("instruction"), "passage": g.get("passage"),
        "sharedBank": [{"label": o["label"], "text": o["text"]} for o in (g.get("sharedBank") or [])],
        "questions": [{"id": q["id"], "prompt": q["prompt"],
                       "options": [{"label": o["label"], "text": o["text"]} for o in (q.get("options") or [])]}
                      for q in g["questions"]],
    }
    sys_p = ('Solve each HSK reading question. Reply STRICT JSON: {"answers":{"<id>":"<letter>"}}. '
             "Choose exactly one option letter per question.")
    out = deepseek(sys_p, json.dumps(payload, ensure_ascii=False))
    ans = out.get("answers", {})
    keys = {q["id"]: q["correctAnswer"] for q in g["questions"]}
    agree = sum(1 for qid, k in keys.items() if str(ans.get(qid, "")) == str(k))
    return (s["id"], agree, len(keys))


def main():
    sampleN = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    files = [f for f in glob.glob(os.path.join(ROOT, "src", "data", "practice", "**", "*.json"), recursive=True)
             if not f.endswith("index.json")]
    by_part = collections.Counter()
    dist = collections.Counter()
    seq = []
    passages, prompts = [], []
    no_pinyin = []
    letter_cite = []          # (set_id, qid) whose explanation cites an option letter
    cloze_noblank = []        # (set_id, qid) cloze prompt with no blank marker
    short_long = []           # (set_id, qid, answer) short-answer ref >10 chars
    part_passages = collections.defaultdict(list)  # (level, partKey) -> [(set_id, passage)]
    for f in files:
        s = json.load(open(f, encoding="utf-8"))
        g = s["groups"][0]
        by_part[(s["level"], s["partKey"])] += 1
        typ = g["questions"][0]["type"]
        keys = [q["correctAnswer"] for q in g["questions"]]
        if typ != "short-answer":
            for k in keys:
                dist[k] += 1
            if typ in ("match", "cloze-wordbank") and keys == sorted(keys) and len(set(keys)) == len(keys):
                seq.append(s["id"])
        if g.get("passage"):
            passages.append(g["passage"])
            part_passages[(s["level"], s["partKey"])].append((s["id"], g["passage"]))
        for q in g["questions"]:
            prompts.append(q["prompt"])
            if LETTER_CITE.search(q.get("explanation", "")):
                letter_cite.append((s["id"], q.get("id")))
            if typ == "cloze-wordbank" and not CLOZE_BLANK.search(q.get("prompt", "")):
                cloze_noblank.append((s["id"], q.get("id")))
            if typ == "short-answer":
                ca = str(q.get("correctAnswer", ""))
                if len(re.sub(r"\s", "", ca)) > 10:
                    short_long.append((s["id"], q.get("id"), ca))
        if s["level"] in ("1", "2", "3"):
            need = (g.get("sharedBank") or []) + [o for q in g["questions"] for o in (q.get("options") or [])]
            if need and not any(o.get("pinyin") for o in need):
                no_pinyin.append(s["id"])

    # near-duplicate passages WITHIN a part (char-trigram Jaccard > 0.5)
    near_dup = []
    for part, items in part_passages.items():
        grams = [(sid, char_trigrams(p)) for sid, p in items]
        for i in range(len(grams)):
            for j in range(i + 1, len(grams)):
                jac = jaccard(grams[i][1], grams[j][1])
                if jac > 0.5:
                    near_dup.append((part, grams[i][0], grams[j][0], round(jac, 2)))

    print("total sets:", len(files))
    print("per-part counts:", dict(sorted(by_part.items())))
    print("answer distribution:", dict(sorted(dist.items())))
    print("strictly-sequential match/cloze sets:", len(seq), seq[:10])
    print("duplicate passages:", len(passages) - len(set(passages)), "| duplicate prompts:", len(prompts) - len(set(prompts)))
    print("HSK1-3 sets missing pinyin:", len(no_pinyin), no_pinyin[:10])
    print("EXPLANATIONS citing option letters:", len(letter_cite), letter_cite[:10])
    print("cloze prompts missing a blank marker:", len(cloze_noblank), cloze_noblank[:10])
    print("short-answer refs >10 chars:", len(short_long), short_long[:10])
    print("near-duplicate passages within a part (>0.5 Jaccard):", len(near_dup), near_dup[:10])

    # sample re-solve
    solvable = [f for f in files if json.load(open(f, encoding="utf-8"))["groups"][0]["questions"][0]["type"] != "short-answer"]
    random.seed(0)
    sample = random.sample(solvable, min(sampleN, len(solvable)))
    print(f"\nre-solving {len(sample)} sampled sets (fresh DeepSeek solve vs stored key) ...")
    tot_q, tot_agree, full = 0, 0, 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        for fut in as_completed([ex.submit(resolve, f) for f in sample]):
            r = fut.result()
            if not r:
                continue
            _sid, agree, n = r
            tot_q += n
            tot_agree += agree
            if agree == n:
                full += 1
    print(f"re-solve agreement: {tot_agree}/{tot_q} questions ({100*tot_agree/max(1,tot_q):.1f}%) | "
          f"{full}/{len(sample)} sets fully agree")


if __name__ == "__main__":
    main()
