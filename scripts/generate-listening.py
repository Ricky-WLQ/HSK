# -*- coding: utf-8 -*-
"""Generate HSK LISTENING practice sets (mirrors generate-reading.py).

Per set: DeepSeek writes a Chinese spoken transcript + questions -> QA gates
(structural + transcript-based solver self-consistency + jieba vocab + answer
shuffle) -> multi-voice audio synthesized & uploaded to R2 (scripts/listening_audio)
-> picture parts also generate images to R2 (scripts/imagegen) -> pinyin added to
VISIBLE text only (never the hidden transcript) -> write per-set JSON. The index is
rebuilt by scanning ALL section dirs so reading sets are never dropped.

Usage:
  python scripts/generate-listening.py --per 20                 # all parts
  python scripts/generate-listening.py --per 1 --part 1:listening-p1 4:listening-p2
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

from listening_specs import SPECS, cumulative_vocab, SPEAKER_VOICE
import listening_audio as LA
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
LETTERS = "ABCDEFG"
MINVOCAB = {"1": 0.70, "2": 0.74, "3": 0.80, "4": 0.85, "5": 0.86, "6": 0.87, "7-9": 0.88}


def deepseek(system, user, temperature=0.7, max_retries=4):
    body = json.dumps({
        "model": MODEL, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"}, "temperature": temperature, "stream": False,
    }).encode("utf-8")
    last = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=body,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            resp = json.load(urllib.request.urlopen(req, timeout=120))
            return json.loads(resp["choices"][0]["message"]["content"])
        except Exception as e:
            last = repr(e)
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("deepseek failed: " + str(last))


def _py(text):
    return " ".join(p[0] for p in _pinyin(text, style=Style.TONE)) if text else ""


def voiced_lines(lines):
    """Attach a tts voice key to each {speaker,text} turn (monologue -> narrator)."""
    out = []
    for ln in lines or []:
        text = (ln.get("text") or "").strip()
        if not text:
            continue
        sp = ln.get("speaker", "") or ""
        voice = ln.get("voice") or SPEAKER_VOICE.get(sp, "narrator")
        out.append({"speaker": sp, "voice": voice, "text": text})
    return out


def transcript_of(lines):
    return " ".join(ln["text"] for ln in lines)


def _img_key_id(desc):
    """Content-address images by scene description so retries with a different scene
    never reuse a stale cached image (and identical scenes dedup across sets)."""
    return "scene-" + hashlib.sha256(desc.strip().encode("utf-8")).hexdigest()[:32]


PIC_TYPES = ("listening-picture-true-false", "listening-picture-match")


def parse_group(level, spec, data, set_id):
    """Build an HskGroup (dict) from DeepSeek output. Assigns audio keys + image
    urls. Audio is rendered/uploaded here so a finished set is fully playable."""
    typ = spec["type"]
    mode = spec["audioMode"]
    group = {"id": "g1", "instruction": data.get("instruction", ""), "questions": []}

    def build_audio(lines):
        vl = voiced_lines(lines)
        if not vl:
            return None
        key, status = LA.build_and_persist(vl)
        if status == "fail":
            raise RuntimeError("audio build failed")
        return {"key": key, "lines": vl, "transcript": transcript_of(vl),
                "transcriptPinyin": _py(transcript_of(vl)) if level in ("1", "2", "3") else None}

    if mode.startswith("per-item"):
        items = data.get("items", [])
        shared_imgs = data.get("sharedImages")  # picture-match
        if typ == "listening-picture-match" and shared_imgs:
            bank = []
            for letter in LETTERS[: spec["sharedBank"]]:
                desc = shared_imgs.get(letter)
                if not desc:
                    raise RuntimeError(f"missing sharedImage {letter}")
                r = IG.make_image(_img_key_id(desc), desc)
                if r["status"] == "fail":
                    raise RuntimeError(f"image fail {letter}")
                bank.append({"label": letter, "text": "", "imageUrl": "/api/practice-image?key=" + r["key"]})
            group["sharedBank"] = bank
        for i, it in enumerate(items, 1):
            q = {"id": f"q{i}", "type": typ, "prompt": it.get("prompt", ""),
                 "correctAnswer": str(it.get("correctAnswer", "")).strip(),
                 "explanation": it.get("explanation", "")}
            q["audio"] = build_audio(it.get("lines"))
            if typ == "listening-mcq":
                q["options"] = [{"label": o["label"], "text": o["text"]} for o in it.get("options", [])]
            elif typ == "listening-picture-true-false":
                desc = it.get("imagePrompts")
                if not desc:
                    raise RuntimeError("missing imagePrompts")
                desc = desc if isinstance(desc, str) else str(desc)
                r = IG.make_image(_img_key_id(desc), desc)
                if r["status"] == "fail":
                    raise RuntimeError("image fail tf")
                # Ground the 对/错 key in the ACTUAL rendered image, not DeepSeek's intent.
                img_bytes = r.get("bytes") or IG.get_image_bytes(r["key"])
                statement = q["audio"]["transcript"] if q.get("audio") else ""
                if not img_bytes:
                    raise RuntimeError("no image bytes for tf check")
                matches = IG.vlm_yesno(img_bytes, f"这张图片表现的是不是这句话的内容：「{statement}」？")
                q["correctAnswer"] = "对" if matches else "错"
                q["imageUrl"] = "/api/practice-image?key=" + r["key"]
            group["questions"].append(q)
    else:  # clustered
        group["audio"] = build_audio(data.get("passageLines"))
        for i, qq in enumerate(data.get("questions", []), 1):
            kind = qq.get("kind", "mcq")
            qtype = "listening-dictation" if (typ == "listening-mcq" and kind == "blank") else typ
            q = {"id": f"q{i}", "type": qtype, "prompt": qq.get("prompt", ""),
                 "correctAnswer": str(qq.get("correctAnswer", "")).strip(),
                 "explanation": qq.get("explanation", "")}
            if qtype == "listening-mcq":
                q["options"] = [{"label": o["label"], "text": o["text"]} for o in qq.get("options", [])]
            if qtype == "listening-dictation" and qq.get("acceptableAnswers"):
                q["acceptableAnswers"] = qq["acceptableAnswers"]
            group["questions"].append(q)
    return group


def add_pinyin(group, level):
    if level not in ("1", "2", "3"):
        return
    for o in group.get("sharedBank") or []:
        if o.get("text"):
            o["pinyin"] = _py(o["text"])
    for q in group["questions"]:
        if q.get("prompt"):
            q["pinyin"] = _py(q["prompt"])
        for o in q.get("options") or []:
            o["pinyin"] = _py(o["text"])


def _relabel(items):
    labels = [it["label"] for it in items]
    perm = list(range(len(items)))
    random.shuffle(perm)
    mapping, new = {}, []
    for new_idx, old_idx in enumerate(perm):
        old = items[old_idx]
        mapping[old["label"]] = labels[new_idx]
        keep = dict(old)
        keep["label"] = labels[new_idx]
        new.append(keep)
    new.sort(key=lambda o: o["label"])
    return new, mapping


def shuffle_answers(group):
    """Randomize MCQ option positions (per question). Picture-match/true-false and
    dictation keep their answers; picture banks are images (position is irrelevant)."""
    for q in group["questions"]:
        if q.get("type") == "listening-mcq" and q.get("options"):
            new_opts, mapping = _relabel(q["options"])
            q["options"] = new_opts
            if q["correctAnswer"] in mapping:
                q["correctAnswer"] = mapping[q["correctAnswer"]]


LETTER_CITE = re.compile(
    r"[选答][:：]?\s*[ABCDEFG]\b|答案[是为]?\s*[ABCDEFG]\b|[（(]\s*[ABCDEFG]\s*[)）]|[ABCDEFG]\s*项|正确答案.{0,4}[ABCDEFG]"
)


def validate_structure(group, spec):
    problems = []
    qs = group.get("questions", [])
    if len(qs) != spec["nQuestions"]:
        problems.append(f"expected {spec['nQuestions']} questions, got {len(qs)}")
    typ = spec["type"]
    if spec.get("sharedBank"):
        bank = group.get("sharedBank") or []
        if len(bank) != spec["sharedBank"]:
            problems.append(f"expected {spec['sharedBank']} pictures, got {len(bank)}")
    for q in qs:
        ca = str(q.get("correctAnswer", ""))
        if not (q.get("audio") or group.get("audio")):
            problems.append(f"{q.get('id')}: no audio")
        if LETTER_CITE.search(str(q.get("explanation", ""))):
            problems.append(f"{q.get('id')}: explanation cites option letter")
        if typ == "listening-mcq" and q.get("type") == "listening-mcq":
            opts = q.get("options") or []
            if len(opts) != (spec.get("options") or 0):
                problems.append(f"{q.get('id')}: expected {spec.get('options')} options, got {len(opts)}")
            if ca not in set(LETTERS[: spec.get("options") or 0]):
                problems.append(f"{q.get('id')}: answer {ca!r} not an option letter")
        elif typ in ("listening-picture-true-false", "listening-statement-true-false"):
            if ca not in ("对", "错"):
                problems.append(f"{q.get('id')}: tf answer {ca!r} not 对/错")
        elif typ == "listening-picture-match":
            if ca not in set(LETTERS[: spec.get("sharedBank") or 0]):
                problems.append(f"{q.get('id')}: match answer {ca!r} not a picture letter")
        elif q.get("type") == "listening-dictation":
            if not ca or len(re.sub(r"\s", "", ca)) > 8:
                problems.append(f"{q.get('id')}: bad dictation answer {ca!r}")
    return problems


def solver_check(group, spec):
    """Transcript-based answer-key self-consistency for MCQ + true/false parts."""
    typ = spec["type"]
    # picture-match needs images; picture-true-false is VLM-grounded at parse time; dictation has no single key
    if typ in ("listening-picture-match", "listening-picture-true-false") or \
            any(q["type"] == "listening-dictation" for q in group["questions"]):
        return True
    def labeled(audio):
        # include speaker labels so 男/女 attribution questions are verifiable
        return "\n".join(f"{l.get('speaker') or '旁白'}：{l['text']}" for l in (audio or {}).get("lines", []))
    payload = {"instruction": group.get("instruction")}
    if group.get("audio"):
        payload["transcript"] = labeled(group["audio"])
        payload["questions"] = [{"id": q["id"], "prompt": q.get("prompt"),
                                 "options": q.get("options")} for q in group["questions"]]
    else:
        payload["items"] = [{"id": q["id"], "transcript": labeled(q.get("audio")),
                             "prompt": q.get("prompt"), "options": q.get("options")} for q in group["questions"]]
    if typ in ("listening-picture-true-false", "listening-statement-true-false"):
        sysp = ('Listen (read transcript) and judge each statement/picture-claim. Reply STRICT JSON '
                '{"answers":{"<id>":"对" or "错"}}.')
    else:
        sysp = ('Solve each listening question from the transcript. Reply STRICT JSON '
                '{"answers":{"<id>":"<letter>"}}. One option letter per question.')
    try:
        out = deepseek(sysp, json.dumps(payload, ensure_ascii=False), temperature=0.0)
        ans = out.get("answers", {})
    except Exception:
        return True
    agree = sum(1 for q in group["questions"] if str(ans.get(q["id"], "")) == str(q["correctAnswer"]))
    return agree >= max(1, int(0.8 * len(group["questions"])))  # 80% (audio items are noisier than reading)


def vocab_ratio(group, allowed, allowed_chars):
    # Measure the level of the CONTENT (heard transcript + options + question stems).
    # The instruction is standard exam boilerplate (judge/picture/sentence direction
    # words) the learner reads, not content to understand by ear — excluding it stops
    # short picture-statements from being unfairly dominated by direction vocabulary.
    texts = []
    if group.get("audio"):
        texts.append(group["audio"]["transcript"])
    for o in group.get("sharedBank") or []:
        texts.append(o.get("text", ""))
    for q in group["questions"]:
        texts.append(q.get("prompt", ""))
        if q.get("audio"):
            texts.append(q["audio"]["transcript"])
        for o in q.get("options") or []:
            texts.append(o.get("text", ""))
    words = [w for w in jieba.cut(" ".join(texts)) if re.search(r"[一-鿿]", w)]
    if not words:
        return 1.0
    def ok(w):
        return w in allowed or all((c in allowed_chars) for c in w if re.search(r"[一-鿿]", c))
    return sum(1 for w in words if ok(w)) / len(words)


def gen_set(level, spec, set_id, allowed, allowed_chars):
    sysp = (
        "You are a precise HSK 3.0 LISTENING item writer (official new-format). Reply STRICT JSON only. "
        f"Use ONLY vocabulary/grammar appropriate to HSK level {level} (cumulative). Spoken transcripts must sound "
        "natural and colloquial. Every question has exactly ONE correct answer. "
        "【硬性规则】解析(explanation)里绝对禁止出现选项字母（A/B/C/D），用文字说明理由。"
    )
    for attempt in range(3):
        try:
            data = deepseek(sysp, spec["prompt"](level), temperature=0.7 + 0.1 * attempt)
            group = parse_group(level, spec, data, set_id)
        except Exception as e:
            print(f"    [{set_id} attempt {attempt}] gen/parse: {repr(e)[:90]}", flush=True)
            continue
        probs = validate_structure(group, spec)
        if probs:
            print(f"    [{set_id} attempt {attempt}] structural: {probs[:2]}", flush=True)
            continue
        if not solver_check(group, spec):
            print(f"    [{set_id} attempt {attempt}] solver disagreed", flush=True)
            continue
        vr = vocab_ratio(group, allowed, allowed_chars)
        thresh = MINVOCAB.get(level, 0.85)
        if vr < thresh:
            print(f"    [{set_id} attempt {attempt}] vocab {vr:.2f} < {thresh}", flush=True)
            continue
        shuffle_answers(group)
        add_pinyin(group, level)
        return group
    return None


def rebuild_index():
    """Scan ALL section dirs so reading + listening are both present."""
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
    idx = {"generated": datetime.now(timezone.utc).isoformat(), "sets": sets}
    json.dump(idx, open(os.path.join(PRACTICE, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return len(sets)


def main():
    args = sys.argv[1:]
    per = 20
    if "--per" in args:
        i = args.index("--per"); per = int(args[i + 1]); args = args[:i] + args[i + 2:]
    part_filter = None
    if "--part" in args:
        i = args.index("--part")
        part_filter = set()
        j = i + 1
        while j < len(args) and ":" in args[j]:
            part_filter.add(args[j]); j += 1
        args = args[:i] + args[j:]
    levels = args or ["1", "2", "3", "4", "5", "6", "7-9"]
    vocab_cache = {lv: cumulative_vocab(lv, ROOT) for lv in levels}

    tasks = []
    for level in levels:
        for spec in [s for s in SPECS if s["level"] == level]:
            if part_filter and f"{level}:{spec['partKey']}" not in part_filter:
                continue
            suffix = spec["partKey"].split("-")[-1]
            for i in range(1, per + 1):
                tasks.append((f"hsk{level}-listening-{suffix}{i:02d}", level, spec))
    print(f"generating {len(tasks)} listening sets ...", flush=True)

    def work(task):
        set_id, level, spec = task
        path = os.path.join(PRACTICE, f"hsk{level}", "listening", set_id + ".json")
        if os.path.exists(path):
            return ("skip", set_id, level, spec, None)
        words, chars = vocab_cache[level]
        group = gen_set(level, spec, set_id, words, chars)
        return ("done", set_id, level, spec, group)

    results, done = [], 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        for fut in as_completed([ex.submit(work, t) for t in tasks]):
            st, set_id, level, spec, group = fut.result()
            done += 1
            if st == "skip":
                continue
            if group is None:
                print(f"  ! {set_id} failed QA", flush=True)
                continue
            outdir = os.path.join(PRACTICE, f"hsk{level}", "listening")
            os.makedirs(outdir, exist_ok=True)
            pset = {"id": set_id, "level": level, "section": "listening", "partKey": spec["partKey"],
                    "title": spec["title"], "titleZh": spec["titleZh"], "groups": [group],
                    "source": "AI-generated (DeepSeek + Edge-TTS + SiliconFlow), HSK 3.0 new format"}
            json.dump(pset, open(os.path.join(outdir, set_id + ".json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            results.append(set_id)
            if done % 10 == 0:
                print(f"  {done}/{len(tasks)} done, {len(results)} new ok", flush=True)

    total = rebuild_index()
    print(f"DONE. {len(results)} new sets; index now has {total} total sets.", flush=True)


if __name__ == "__main__":
    main()
