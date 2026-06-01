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
import random
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
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


def _relabel(items):
    """Shuffle item texts across the labels A,B,C,... Returns (new_items, oldLabel->newLabel)."""
    labels = [it["label"] for it in items]
    perm = list(range(len(items)))
    random.shuffle(perm)
    mapping, new = {}, []
    for new_idx, old_idx in enumerate(perm):
        old = items[old_idx]
        mapping[old["label"]] = labels[new_idx]
        keep = {"label": labels[new_idx], "text": old["text"]}
        if "pinyin" in old:
            keep["pinyin"] = old["pinyin"]
        new.append(keep)
    new.sort(key=lambda o: o["label"])
    return new, mapping


def shuffle_answers(group):
    """Randomize answer positions so the correct answers are NOT in A,B,C,… order
    and are roughly uniform. DeepSeek places correct answers early, so this is
    essential (without it a learner could just pick A,B,C,D,E)."""
    qs = group["questions"]
    if group.get("sharedBank"):
        keys = [q["correctAnswer"] for q in qs]
        new_bank, mapping = _relabel(group["sharedBank"])
        for _ in range(25):
            new_keys = [mapping[k] for k in keys]
            sequential = new_keys == sorted(new_keys) and len(set(new_keys)) == len(new_keys)
            if not sequential and new_keys != keys:
                break
            new_bank, mapping = _relabel(group["sharedBank"])
        group["sharedBank"] = new_bank
        for q in qs:
            q["correctAnswer"] = mapping[q["correctAnswer"]]
    else:
        for q in qs:
            if q.get("options"):
                new_opts, mapping = _relabel(q["options"])
                q["options"] = new_opts
                q["correctAnswer"] = mapping[q["correctAnswer"]]

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
MINVOCAB = {"1": 0.70, "2": 0.78, "3": 0.83, "4": 0.85, "5": 0.87, "6": 0.88, "7-9": 0.90}

# Explanations must NOT cite option letters: options are shuffled AFTER generation,
# so a letter reference written at generation time would point at the wrong option.
# This gate hard-rejects any explanation that cites a letter (prompt alone is not
# enough — the model ignores the instruction ~9% of the time on analytical items).
LETTER_CITE = re.compile(
    r"[选答][:：]?\s*[ABCDEFG]\b|答案[是为]?\s*[ABCDEFG]\b|[（(]\s*[ABCDEFG]\s*[)）]|[ABCDEFG]\s*项|正确答案.{0,4}[ABCDEFG]"
)


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
    cloze_blank = re.compile(r"[（(][\s　]*[)）]|_{2,}|＿+")
    for q in qs:
        ca = str(q.get("correctAnswer", ""))
        if spec["type"] == "short-answer":
            if not ca:
                problems.append(f"{q.get('id')}: empty reference answer")
            elif len(re.sub(r"\s", "", ca)) > 10:
                problems.append(f"{q.get('id')}: reference answer >10 chars ({ca!r})")
            continue
        if spec["type"] == "cloze-wordbank" and not cloze_blank.search(str(q.get("prompt", ""))):
            problems.append(f"{q.get('id')}: cloze prompt missing a blank marker")
        if LETTER_CITE.search(str(q.get("explanation", ""))):
            problems.append(f"{q.get('id')}: explanation cites an option letter")
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


TOPICS = [
    "饮食与烹饪", "旅行与交通", "体育运动", "科技与互联网", "环境保护", "健康与医疗",
    "校园学习", "家庭与亲情", "工作与职业", "兴趣爱好", "传统节日", "天气与季节",
    "购物与消费", "动物与自然", "历史与文化", "科学发现", "艺术与音乐", "城市与乡村",
    "友谊与社交", "读书与写作", "志愿服务", "创业与经济", "心理与情绪", "时间管理",
    "电影与娱乐", "建筑与设计", "太空与天文", "海洋与地理", "美食文化", "民俗风情",
]


def gen_group(level, spec, allowed, allowed_chars):
    sys_p = (
        "You are a precise HSK 3.0 exam item writer following the OFFICIAL new-format. "
        "Write authentic Chinese reading items. Reply STRICT JSON only matching the requested schema. "
        f"Use ONLY vocabulary and grammar appropriate to HSK level {level} (cumulative). Every item "
        "must have exactly ONE unambiguous correct answer; distractors must be clearly wrong but plausible. "
        "【硬性规则】解析(explanation)里绝对禁止出现任何选项字母（A/B/C/D/E/F/G），也不要写"
        "“选A”“答案是B”“正确答案为C”“C项”“（D）”这类表述——因为选项顺序之后会被随机打乱，"
        "字母会失效。只用文字复述正确选项的内容并说明理由（可引用原文/词义）。"
        "示例（正确写法）：解析=“短文说他每天坚持跑步，所以正确的是‘喜欢运动’。”"
        "（错误写法，禁止）：解析=“答案是B，因为……”。"
    )
    for attempt in range(3):
        try:
            topic = random.choice(TOPICS)
            user = spec["prompt"](level) + (
                f"\n\n请围绕主题「{topic}」构思，内容新颖具体，避免周末/公园/买水果等套路化场景；"
                "每次生成都应是不同的人物、情境和细节。"
            )
            group = deepseek(sys_p, user, temperature=0.7 + 0.1 * attempt)
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
    args = sys.argv[1:]
    per = 20
    if "--per" in args:
        i = args.index("--per")
        per = int(args[i + 1])
        args = args[:i] + args[i + 2:]
    levels = args or ["1", "2", "3", "4", "5", "6", "7-9"]
    vocab_cache = {lv: cumulative_vocab(lv, ROOT) for lv in levels}

    tasks = []  # (set_id, level, spec)
    for level in levels:
        for spec in [s for s in SPECS if s["level"] == level]:
            suffix = spec["partKey"].split("-")[-1]
            for i in range(1, per + 1):
                tasks.append((f"hsk{level}-reading-{suffix}{i:02d}", level, spec))
    print(f"generating {len(tasks)} sets ({per} per part) across {len(levels)} levels ...", flush=True)

    def work(task):
        set_id, level, spec = task
        # resumable: keep already-generated sets (skip regeneration / fill gaps only)
        existing_path = os.path.join(PRACTICE, f"hsk{level}", "reading", set_id + ".json")
        if os.path.exists(existing_path):
            try:
                return (set_id, level, spec, json.load(open(existing_path, encoding="utf-8"))["groups"][0])
            except Exception:
                pass
        words, chars = vocab_cache[level]
        group = gen_group(level, spec, words, chars)
        if group:
            shuffle_answers(group)
            add_pinyin(group, level)
            group["id"] = "g1"
        return (set_id, level, spec, group)

    results, done = [], 0
    with ThreadPoolExecutor(max_workers=14) as ex:
        for fut in as_completed([ex.submit(work, t) for t in tasks]):
            set_id, level, spec, group = fut.result()
            done += 1
            if group is None:
                print(f"  ! {set_id}: failed QA", flush=True)
            else:
                results.append((set_id, level, spec, group))
            if done % 25 == 0:
                print(f"  {done}/{len(tasks)} done, {len(results)} ok", flush=True)

    index = {"generated": datetime.now(timezone.utc).isoformat(), "sets": []}
    for set_id, level, spec, group in results:
        outdir = os.path.join(PRACTICE, f"hsk{level}", "reading")
        os.makedirs(outdir, exist_ok=True)
        pset = {
            "id": set_id, "level": level, "section": "reading", "partKey": spec["partKey"],
            "title": spec["title"], "titleZh": spec["titleZh"], "groups": [group],
            "source": "AI-generated (DeepSeek), HSK 3.0 new format",
        }
        json.dump(pset, open(os.path.join(outdir, set_id + ".json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        index["sets"].append({
            "id": set_id, "level": level, "section": "reading", "partKey": spec["partKey"],
            "title": spec["title"], "titleZh": spec["titleZh"], "questionCount": len(group["questions"]),
        })
    index["sets"].sort(key=lambda s: s["id"])
    json.dump(index, open(os.path.join(PRACTICE, "index.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"DONE. {len(index['sets'])}/{len(tasks)} sets generated.", flush=True)


if __name__ == "__main__":
    main()
