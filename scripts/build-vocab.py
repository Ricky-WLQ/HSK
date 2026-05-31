"""
Build the HSK 3.0 (2025 syllabus) vocabulary word lists for levels 1-9.

Source: drkameleon/complete-hsk-vocabulary (MIT), folder exclusive/newest/ —
the 2025-standard ("newest") lists. We ship ONLY license-safe facts
(hanzi, traditional, tone-marked pinyin readings, part-of-speech, level).
English definitions/examples are generated separately with DeepSeek (so we
do NOT redistribute the dataset's CC-CEDICT `meanings`).

Clone the source first:
  git clone --depth 1 https://github.com/drkameleon/complete-hsk-vocabulary <SRC>/..

Output: src/data/vocab/hsk{1..6}.json, hsk7-9.json, index.json
"""
import json
import os
import sys
import unicodedata
from pypinyin import pinyin, Style
from opencc import OpenCC

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\wul82\Desktop\HSK\_build\chv\wordlists\exclusive\newest"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data", "vocab")
os.makedirs(OUT, exist_ok=True)

LEVEL_NAME = {1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7-9"}

# --- Pinyin/traditional correction -------------------------------------------
# The source `forms` array is NOT ordered primary-reading-first (it often lists a
# capitalized proper-noun or rare reading first), so we re-derive the primary
# reading with pypinyin (phrase-aware) and standardize the traditional form with
# OpenCC s2tw. Genuinely-ambiguous characters are pinned in pinyin_overrides.json.
# (English definitions/examples are added afterward by generate-vocab-definitions.py;
# a rebuild must be followed by a definitions regeneration for any changed reading.)
_cc = OpenCC("s2tw")
_PROPER = {"nr", "ns", "nt", "nz", "nrf"}
_OVR_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pinyin_overrides.json")
_OVERRIDES = json.load(open(_OVR_PATH, encoding="utf-8")) if os.path.exists(_OVR_PATH) else {}


def _tl(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().replace(" ", "").replace("ü", "u").replace("v", "u")


def _nf(s):
    return unicodedata.normalize("NFC", s).strip().lower().replace(" ", "")


def _lower_first(s):
    return s[:1].lower() + s[1:] if s else s


def _pick_primary(hanzi, readings, pos):
    """Return (primary_pinyin, reordered_readings): primary reading first,
    deduped, lowercased unless the word is a proper noun."""
    if hanzi in _OVERRIDES:
        primary = _OVERRIDES[hanzi]
    else:
        try:
            py = " ".join(x[0] for x in pinyin(hanzi, style=Style.TONE, heteronym=False))
        except Exception:
            py = ""
        exact = [r for r in readings if _nf(r) == _nf(py)]
        primary = exact[0] if exact else (readings[0] if readings else "")
    # Capitalize only when EVERY pos code is a proper-noun code (e.g. 中国/亚洲);
    # words with a mere secondary surname sense (钱/海/马) stay lowercase.
    if not (pos and all(p in _PROPER for p in pos)):
        primary = _lower_first(primary)
    out, seen = [], set()
    for r in [primary] + [r for r in readings if _tl(r) != _tl(primary)]:
        if _nf(r) not in seen:
            seen.add(_nf(r))
            out.append(r)
    return primary, out

index = []
for i in range(1, 8):
    with open(os.path.join(SRC, f"{i}.json"), encoding="utf-8") as f:
        data = json.load(f)
    level = LEVEL_NAME[i]
    words = []
    for idx, e in enumerate(data, 1):
        forms = e.get("forms", [])
        readings = []
        for fm in forms:
            p = (fm.get("transcriptions") or {}).get("pinyin")
            if p and p not in readings:
                readings.append(p)
        primary, readings = _pick_primary(e["simplified"], readings, e.get("pos", []))
        trad = _cc.convert(e["simplified"])
        words.append({
            "id": f"hsk{level}-{idx:04d}",
            "hanzi": e["simplified"],
            "traditional": trad if trad != e["simplified"] else None,
            "level": level,
            "pinyin": primary,
            "readings": readings,
            "pos": e.get("pos", []),
        })
    outpath = os.path.join(OUT, f"hsk{level}.json")
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=1)
    index.append({"level": level, "file": f"hsk{level}.json", "count": len(words)})
    print(f"hsk{level}: {len(words)} words -> {outpath}")

with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump({
        "standard": "HSK 3.0 (2025 syllabus)",
        "source": "drkameleon/complete-hsk-vocabulary (MIT) exclusive/newest",
        "note": "Facts only (hanzi/pinyin/pos/level). English definitions generated separately with DeepSeek.",
        "levels": index,
    }, f, ensure_ascii=False, indent=1)

print("TOTAL:", sum(x["count"] for x in index))
