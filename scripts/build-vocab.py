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

SRC = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\wul82\Desktop\HSK\_build\chv\wordlists\exclusive\newest"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data", "vocab")
os.makedirs(OUT, exist_ok=True)

LEVEL_NAME = {1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7-9"}

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
        trad = forms[0].get("traditional") if forms else None
        words.append({
            "id": f"hsk{level}-{idx:04d}",
            "hanzi": e["simplified"],
            "traditional": trad if (trad and trad != e["simplified"]) else None,
            "level": level,
            "pinyin": readings[0] if readings else "",
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
