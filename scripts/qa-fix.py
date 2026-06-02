"""
Apply content QA fixes (idempotent):
  FIX 1 (deterministic): flip listening true-false correctAnswer to agree with its
         explanation's stated conclusion (match -> 对, mismatch -> 错).
  FIX 2 (DeepSeek): regenerate empty MCQ question stems from the shared audio + options + answer.
  FIX 3 (DeepSeek): regenerate generic/duplicated picture-match explanations so each
         references its own dialogue (uniqueness + specificity).
Re-run scripts/qa-content.py afterward; loop until 0 issues.
"""
import json, glob, os, time, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k] = v.strip().strip('"')
KEY = env["DEEPSEEK_API_KEY"]; MODEL = env.get("DEEPSEEK_MODEL", "deepseek-v4-flash")

MISMATCH_KW = ("不一致", "不符", "不相符", "不正确", "不同", "不是", "没有", "错误")
MATCH_KW = ("一致", "相符", "符合", "正是", "相同", "正确")
TF_TYPES = {"listening-picture-true-false", "listening-statement-true-false"}


def deepseek(system, user, temp=0.4):
    body = {"model": MODEL, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_object"}, "temperature": temp, "stream": False}
    data = json.dumps(body).encode()
    last = None
    for a in range(4):
        try:
            req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=data,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            return json.loads(json.load(urllib.request.urlopen(req, timeout=90))["choices"][0]["message"]["content"])
        except Exception as e:  # noqa
            last = repr(e); time.sleep(2 * (a + 1))
    raise RuntimeError(last)


practice = glob.glob(os.path.join(ROOT, "src/data/practice/**/*.json"), recursive=True)

# ---------- FIX 1: tf contradictions ----------
flipped = 0
for f in practice:
    d = json.load(open(f, encoding="utf-8")); ch = False
    for g in d.get("groups", []):
        for q in g.get("questions", []):
            if q.get("type") in TF_TYPES:
                ca = q.get("correctAnswer", ""); ex = q.get("explanation", "") or ""
                mis = any(k in ex for k in MISMATCH_KW); mat = (not mis) and any(k in ex for k in MATCH_KW)
                if mis and ca == "对": q["correctAnswer"] = "错"; ch = True; flipped += 1
                elif mat and ca == "错": q["correctAnswer"] = "对"; ch = True; flipped += 1
    if ch:
        json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"FIX1: flipped {flipped} true-false answers", flush=True)

# ---------- collect FIX 2 + FIX 3 targets ----------
STEM_SYS = ("你是HSK听力命题老师。给你一段听力材料、四个选项和正确答案，请写出对应的中文问题（问句），"
            "使该问题的正确答案正是给定选项。只用JSON返回：{\"prompt\":\"<问句>\"}。")
EXPL_SYS = ("你是HSK听力老师。给你一段对话和它对应的正确图片标签，请写一句简洁、具体、引用对话内容的中文解析，"
            "说明为什么这段对话对应该图片。只用JSON返回：{\"explanation\":\"<解析>\"}。")

stem_jobs, expl_jobs = [], []  # (file, gi, qi, payload)
for f in practice:
    d = json.load(open(f, encoding="utf-8"))
    for gi, g in enumerate(d.get("groups", [])):
        transcript = (g.get("audio") or {}).get("transcript", "")
        # dup explanations within this group?
        seen = {}; dup_group = False
        for q in g.get("questions", []):
            ex = (q.get("explanation", "") or "").strip()
            if ex and ex in seen: dup_group = True
            seen[ex] = 1
        for qi, q in enumerate(g.get("questions", [])):
            typ = q.get("type", "")
            if typ in ("passage-mcq", "listening-mcq", "cloze-paragraph", "cloze-insert") and not (q.get("prompt", "") or "").strip():
                opts = "; ".join(f"{o['label']}.{o.get('text','')}" for o in (q.get("options") or []))
                stem_jobs.append((f, gi, qi, f"听力材料：{transcript or '(见各题音频)'}\n选项：{opts}\n正确答案：{q.get('correctAnswer')}"))
            if typ == "listening-picture-match" and dup_group:
                tr = (q.get("audio") or {}).get("transcript", "")
                expl_jobs.append((f, gi, qi, f"对话：{tr}\n正确图片标签：{q.get('correctAnswer')}"))

print(f"FIX2: {len(stem_jobs)} empty stems | FIX3: {len(expl_jobs)} explanations to regen", flush=True)


def run_stem(job):
    f, gi, qi, u = job
    try: return f, gi, qi, deepseek(STEM_SYS, u).get("prompt", "").strip()
    except Exception: return f, gi, qi, None

def run_expl(job):
    f, gi, qi, u = job
    try: return f, gi, qi, deepseek(EXPL_SYS, u).get("explanation", "").strip()
    except Exception: return f, gi, qi, None


def apply(jobs, fn, field):
    by_file = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for f, gi, qi, val in ex.map(fn, jobs):
            if val:
                by_file.setdefault(f, []).append((gi, qi, val))
    n = 0
    for f, ups in by_file.items():
        d = json.load(open(f, encoding="utf-8"))
        for gi, qi, val in ups:
            d["groups"][gi]["questions"][qi][field] = val; n += 1
        json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return n

if stem_jobs:
    print(f"FIX2: wrote {apply(stem_jobs, run_stem, 'prompt')} stems", flush=True)
if expl_jobs:
    print(f"FIX3: wrote {apply(expl_jobs, run_expl, 'explanation')} explanations", flush=True)
print("DONE", flush=True)
