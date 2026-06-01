"""Build src/data/grammar/index.json from the per-level grammar files."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GDIR = os.path.join(ROOT, "src", "data", "grammar")
LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"]

levels = []
for lv in LEVELS:
    path = os.path.join(GDIR, f"hsk{lv}.json")
    if not os.path.exists(path):
        print(f"  (skip hsk{lv}: not generated yet)")
        continue
    pts = json.load(open(path, encoding="utf-8"))
    drills = sum(len(p.get("drills", [])) for p in pts)
    levels.append({"level": lv, "file": f"hsk{lv}.json", "points": len(pts), "drills": drills})

index = {
    "standard": "HSK 3.0 (2021 CLEC)",
    "source": "Official HSK syllabus grammar (graded 1-6 + syllabus 7-9), DeepSeek-enriched",
    "levels": levels,
}
json.dump(index, open(os.path.join(GDIR, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("index.json written:")
for l in levels:
    print(f"  HSK {l['level']}: {l['points']} points, {l['drills']} drills")
print("TOTAL:", sum(l["points"] for l in levels), "points,", sum(l["drills"] for l in levels), "drills")
