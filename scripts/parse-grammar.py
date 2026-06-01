"""
Parse the official HSK grammar sources into raw structured rows per level.

Sources (READ-ONLY official materials — never modified):
  A) 分级语法1-6级.md  — graded grammar table for L1-6 (point | structural form | examples).
     The OCR mislabels the level headers (二级 then 三级 TWICE, no 四级). Verified against
     the official syllabus: the six level-blocks are, in document order, L1 L2 L3 L4 L5 L6.
     So we assign levels BY POSITION, ignoring the (wrong) header text.
  B) 新版HSK考试大纲.md — official syllabus grammar section (类别|类别名称|细目|语法内容),
     correctly labeled HSK(一级)…(六级) + (七—九级). Authoritative taxonomy. Used as the
     L7-9 source and as an L1-6 coverage cross-check.

Output: hsk-app/_build/grammar/raw_graded.json and raw_syllabus.json (scratch, gitignored).
This step is purely deterministic extraction; DeepSeek enrichment happens in a later step.
"""
import json, os, re

HSK = r"C:/Users/wul82/Desktop/HSK"
GRADED = f"{HSK}/HSK ocr results(1)/HSK ocr results/3 语法和词汇/HSK语法md/分级语法1-6级.md"
SYLLABUS = f"{HSK}/HSK ocr results(1)/HSK ocr results/1 考试大纲 评分细则/考试大纲md/新考试大纲/新版HSK考试大纲.md"
OUT = os.path.join(os.path.dirname(__file__), "..", "_build", "grammar")
os.makedirs(OUT, exist_ok=True)

LEVELS6 = ["1", "2", "3", "4", "5", "6"]


def split_cells(line):
    """Split a markdown table row '| a | b | c |' into ['a','b','c'] (trimmed)."""
    s = line.strip()
    if not s.startswith("|"):
        return None
    cells = [c.strip() for c in s.strip("|").split("|")]
    return cells


def is_sep(cells):
    return cells is not None and all(set(c) <= set("-: ") and c for c in cells if c != "")


# ---------- A) graded grammar (L1-6, by position) ----------
def parse_graded():
    lines = open(GRADED, encoding="utf-8").read().splitlines()
    # find the six level-block header lines (……级语法项目表)
    hdr_idx = [i for i, ln in enumerate(lines) if re.search(r"级语法项目表", ln)]
    assert len(hdr_idx) == 6, f"expected 6 graded level blocks, found {len(hdr_idx)}: {hdr_idx}"
    bounds = hdr_idx + [len(lines)]
    out = {}
    for k, lvl in enumerate(LEVELS6):
        block = lines[bounds[k] + 1: bounds[k + 1]]
        rows = []
        category = ""  # forward-filled 类别 (实词/虚词/句子成分.../复句)
        for ln in block:
            cells = split_cells(ln)
            if not cells or is_sep(cells):
                continue
            joined = "".join(cells)
            if "语法项目" in joined and "结构形式" in joined:
                # column-header row, e.g. | 实词 | 语法项目 | 结构形式 | 举例 |
                # capture a leading category label (实词/虚词/...) before skipping it.
                if cells[0] and "语法项目" not in cells[0]:
                    category = cells[0]
                continue  # column header row
            if "目标描述" in cells[0] or (len(cells) >= 2 and "目标描述" in cells[1]):
                out.setdefault("_objectives", {})[lvl] = " ".join(c for c in cells if c and "目标描述" not in c)
                continue
            # Expected content row shapes:
            #   4 cells: [category, point, form, examples]
            #   3 cells: [point, form, examples]   (category continues from above)
            if len(cells) >= 4:
                cat, point, form, ex = cells[0], cells[1], cells[2], cells[3]
                if cat:
                    category = cat
            elif len(cells) == 3:
                point, form, ex = cells[0], cells[1], cells[2]
            else:
                continue
            if not (point or form or ex):
                continue
            rows.append({"category": category, "point": point, "form": form, "examples": ex})
        out[lvl] = rows
    return out


# ---------- B) syllabus grammar (L1-9, authoritative taxonomy) ----------
def parse_syllabus():
    lines = open(SYLLABUS, encoding="utf-8").read().splitlines()
    hdrs = []  # (level, line_index)
    for i, ln in enumerate(lines):
        m = re.match(r"\s*HSK[（(]([一二三四五六]|七[—\-一]九)级[）)]语法\s*$", ln.strip())
        if m:
            zh = m.group(1)
            lvl = {"一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6"}.get(zh, "7-9")
            hdrs.append((lvl, i))
    assert len(hdrs) == 7, f"expected 7 syllabus grammar headers, found {len(hdrs)}: {[h[0] for h in hdrs]}"
    out = {}
    for k, (lvl, idx) in enumerate(hdrs):
        end = hdrs[k + 1][1] if k + 1 < len(hdrs) else len(lines)
        block = lines[idx + 1: end]
        rows = []
        cat = subcat = detail = ""  # forward-filled 类别 / 类别名称 / 细目
        for ln in block:
            cells = split_cells(ln)
            if not cells or is_sep(cells):
                continue
            joined = "".join(cells)
            if "类别" in joined and "语法内容" in joined:
                continue
            if re.fullmatch(r"\d+", joined):  # stray page number
                continue
            # Expected: [类别, 类别名称, 细目, 语法内容] but OCR drops leading empty cols.
            # Right-align: the LAST cell is always 语法内容; fill the rest from the left.
            parts = cells
            content = parts[-1]
            left = parts[:-1]
            # map left cells to (cat, subcat, detail) honoring blanks => keep previous
            if len(left) >= 1 and left[0]:
                cat = left[0]
            if len(left) >= 2 and left[1]:
                subcat = left[1]
            if len(left) >= 3 and left[2]:
                detail = left[2]
            if not content:
                continue
            rows.append({"category": cat, "subCategory": subcat, "detail": detail, "content": content})
        out[lvl] = rows
    return out


graded = parse_graded()
syllabus = parse_syllabus()
json.dump(graded, open(os.path.join(OUT, "raw_graded.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(syllabus, open(os.path.join(OUT, "raw_syllabus.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("=== graded (分级语法, by position) rows per level ===")
for lvl in LEVELS6:
    print(f"  L{lvl}: {len(graded[lvl])} rows")
print("=== syllabus (authoritative) rows per level ===")
for lvl in ["1", "2", "3", "4", "5", "6", "7-9"]:
    print(f"  L{lvl}: {len(syllabus[lvl])} rows")
print("\n=== sample: graded L1 first 4 ===")
for r in graded["1"][:4]:
    print(" ", r)
print("\n=== sample: syllabus L7-9 first 4 ===")
for r in syllabus["7-9"][:4]:
    print(" ", r)
