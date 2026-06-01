"""
Generate the HSK grammar bank from the parsed official sources.

Pipeline (DeepSeek deepseek-v4-flash, JSON mode; pypinyin for example pinyin):
  1. L7-9 points are CONSOLIDATED from the official syllabus taxonomy (one DeepSeek
     call) into ~40 teachable grammar points (cached to _build/grammar/points_7-9.json).
  2. For every point (graded L1-6 + consolidated L7-9), one DeepSeek call produces the
     enriched study card (EN name/explanation, structural form, 2-3 examples) PLUS
     exam-aligned MCQ drills (fill_blank / choose_form). pypinyin adds example pinyin.
  3. QA: drills must have 4 options + a valid answerIndex; examples must have zh+en.

Idempotent + resumable: skips points already present (by id) in src/data/grammar/hskN.json.
Reads DEEPSEEK_API_KEY / DEEPSEEK_MODEL from .env (gitignored).

Usage:  python scripts/generate-grammar.py [level ...]   (default: all 7 bands)
"""
import json, os, sys, time, re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pypinyin import pinyin, Style

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "_build", "grammar")
OUTDIR = os.path.join(ROOT, "src", "data", "grammar")
os.makedirs(OUTDIR, exist_ok=True)

env = {}
with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')
KEY = env["DEEPSEEK_API_KEY"]
MODEL = env.get("DEEPSEEK_MODEL", "deepseek-v4-flash")
LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"]


def deepseek(system, user, temperature=0.4, timeout=120):
    body = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
        "temperature": temperature, "stream": False,
    }
    data = json.dumps(body).encode("utf-8")
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                "https://api.deepseek.com/chat/completions", data=data,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
            r = urllib.request.urlopen(req, timeout=timeout)
            return json.loads(json.load(r)["choices"][0]["message"]["content"])
        except Exception as e:  # noqa
            last = repr(e)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"deepseek failed: {last}")


def py(zh):
    """Tone-marked pinyin for a Chinese sentence (punctuation passes through)."""
    out = []
    for seg in re.findall(r"[一-鿿]+|[^一-鿿]+", zh):
        if re.match(r"[一-鿿]", seg):
            out.append(" ".join(s[0] for s in pinyin(seg, style=Style.TONE)))
        else:
            out.append(seg)
    return "".join(out).strip()


# ---------- 1. consolidate L7-9 ----------
def consolidate_l79():
    cache = os.path.join(BUILD, "points_7-9.json")
    if os.path.exists(cache):
        return json.load(open(cache, encoding="utf-8"))
    syl = json.load(open(os.path.join(BUILD, "raw_syllabus.json"), encoding="utf-8"))["7-9"]
    lines = [f"{r['category']} / {r['subCategory']} / {r['detail']}: {r['content']}" for r in syl]
    system = (
        "You are an HSK curriculum expert. From the OFFICIAL HSK 7-9 grammar syllabus "
        "(categorized items) the user gives you, produce a curated JSON list of the most "
        "important TEACHABLE grammar points for advanced learners. Focus on sentence "
        "structures, complements, special sentence patterns, complex/compound sentences, "
        "and fixed grammatical patterns (固定格式). SKIP pure vocabulary or word-formation "
        "(语素) lists. Return STRICT JSON: {\"points\":[{\"point\":\"<concise Chinese grammar "
        "point name>\",\"form\":\"<structural pattern>\",\"examples\":\"<1-2 example "
        "sentences in Chinese, space-separated>\"}]}. Aim for 35-45 points."
    )
    res = deepseek(system, "HSK 7-9 official grammar syllabus:\n" + "\n".join(lines), timeout=180)
    pts = res.get("points", [])
    json.dump(pts, open(cache, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"L7-9 consolidated: {len(pts)} points", flush=True)
    return pts


# ---------- 2. assemble raw point list per level ----------
def assemble_points():
    graded = json.load(open(os.path.join(BUILD, "raw_graded.json"), encoding="utf-8"))
    points = {lv: [] for lv in LEVELS}
    for lv in ["1", "2", "3", "4", "5", "6"]:
        for i, r in enumerate(graded[lv], 1):
            points[lv].append({"id": f"g-{lv}-{i:02d}", "level": lv, "src_category": r["category"],
                               "point": r["point"], "form": r["form"], "examples": r["examples"]})
    for i, r in enumerate(consolidate_l79(), 1):
        points["7-9"].append({"id": f"g-7-9-{i:02d}", "level": "7-9", "src_category": "",
                              "point": r.get("point", ""), "form": r.get("form", ""),
                              "examples": r.get("examples", "")})
    return points


ENRICH_SYS = (
    "You are a bilingual HSK grammar teacher building grammar-practice cards. The user gives "
    "ONE official grammar point (Chinese name, structural form, example fragments) and its HSK "
    "level. Produce STRICT JSON only:\n"
    "{\"nameZh\":\"<clean concise Chinese name>\",\"nameEn\":\"<English name>\","
    "\"category\":\"<short English category: Pronouns|Verbs|Adverbs|Prepositions|Particles|"
    "Complements|Sentence patterns|Comparison|Complex sentences|Numbers & measure words|"
    "Fixed patterns|Other>\",\"explanation\":\"<clear 1-3 sentence English explanation of "
    "usage>\",\"structuralForm\":\"<the pattern, may keep Chinese form markers>\","
    "\"examples\":[{\"zh\":\"<natural sentence>\",\"en\":\"<translation>\"}],"
    "\"drills\":[{\"type\":\"fill_blank|choose_form\",\"prompt\":\"<for fill_blank: a sentence "
    "with one （ ） gap testing THIS point; for choose_form: a sentence + what to choose>\","
    "\"options\":[\"<4 distinct options>\"],\"answerIndex\":<0-3>,"
    "\"explanation\":\"<brief English why>\"}]}\n"
    "Rules: 2-3 examples. EXACTLY 4 drills, each with EXACTLY 4 options and a correct answerIndex; "
    "mix fill_blank and choose_form; every drill must specifically test THIS grammar point; use "
    "vocabulary appropriate to the HSK level; distractors must be plausible but clearly wrong. "
    "All explanations in English. Chinese sentences must be natural and correct."
)


def enrich(p):
    user = (f"HSK level: {p['level']}\nGrammar point: {p['point']}\n"
            f"Structural form: {p['form']}\nExample fragments: {p['examples']}")
    try:
        r = deepseek(ENRICH_SYS, user)
    except Exception as e:  # noqa
        return p["id"], {"_error": str(e)[:100]}
    # QA + assemble
    exs = []
    for e in (r.get("examples") or [])[:3]:
        zh = (e.get("zh") or "").strip()
        if zh:
            exs.append({"zh": zh, "pinyin": py(zh), "en": (e.get("en") or "").strip()})
    drills = []
    for d in (r.get("drills") or []):
        opts = [str(o).strip() for o in (d.get("options") or []) if str(o).strip()]
        ai = d.get("answerIndex")
        if len(opts) == 4 and isinstance(ai, int) and 0 <= ai <= 3 and (d.get("prompt") or "").strip():
            drills.append({"type": d.get("type", "fill_blank"), "prompt": d["prompt"].strip(),
                           "options": opts, "answerIndex": ai,
                           "explanation": (d.get("explanation") or "").strip()})
    if len(exs) < 1 or len(drills) < 2:
        return p["id"], {"_error": f"thin (ex={len(exs)},drills={len(drills)})"}
    return p["id"], {
        "id": p["id"], "level": p["level"],
        "category": (r.get("category") or "Other").strip(),
        "nameZh": (r.get("nameZh") or p["point"][:20]).strip(),
        "nameEn": (r.get("nameEn") or "").strip(),
        "explanation": (r.get("explanation") or "").strip(),
        "structuralForm": (r.get("structuralForm") or p["form"]).strip(),
        "examples": exs, "drills": drills,
    }


def process_level(level, points):
    path = os.path.join(OUTDIR, f"hsk{level}.json")
    existing = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
    have = {g["id"] for g in existing}
    todo = [p for p in points[level] if p["id"] not in have]
    if not todo:
        print(f"hsk{level}: complete ({len(existing)} points)", flush=True)
        return
    print(f"hsk{level}: generating {len(todo)}/{len(points[level])} ...", flush=True)
    by_id = {g["id"]: g for g in existing}
    done = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(enrich, p): p for p in todo}
        for fut in as_completed(futs):
            gid, res = fut.result()
            if "_error" in res:
                print(f"  ! {gid}: {res['_error']}", flush=True)
            else:
                by_id[gid] = res
            done += 1
            if done % 20 == 0:
                ordered = [by_id[p["id"]] for p in points[level] if p["id"] in by_id]
                json.dump(ordered, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                print(f"  ...{done}/{len(todo)} saved", flush=True)
    ordered = [by_id[p["id"]] for p in points[level] if p["id"] in by_id]
    json.dump(ordered, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"hsk{level}: done ({len(ordered)} points)", flush=True)


if __name__ == "__main__":
    points = assemble_points()
    for lv in (sys.argv[1:] or LEVELS):
        process_level(lv, points)
    print("ALL DONE", flush=True)
