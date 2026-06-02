"""
Comprehensive content QA scanner for the HSK practice + grammar banks.
Detects structural issues; prints a categorized report with concrete offenders.
Read-only (no mutation). Run repeatedly until it reports 0 issues.
"""
import json, glob, collections
from pathlib import Path

LABEL_TYPES = {"match", "cloze-wordbank", "passage-mcq", "cloze-insert", "cloze-paragraph",
               "ordering", "image-match", "listening-picture-match", "listening-mcq"}
TF_TYPES = {"listening-picture-true-false", "listening-statement-true-false"}
TEXT_TYPES = {"short-answer", "listening-dictation", "writing-fill-char", "writing-sentence",
              "writing-essay", "translation-passage"}
# Types where an empty per-question prompt is BY DESIGN (media/word/image carries the task).
PROMPT_OPTIONAL = {"listening-picture-true-false", "listening-picture-match", "image-match",
                   "writing-sentence"}
MISMATCH_KW = ("不一致", "不符", "不相符", "不正确", "不同", "不是", "没有", "错误")
MATCH_KW = ("一致", "相符", "符合", "正是", "相同", "正确")

issues = collections.defaultdict(list)
nq = 0

for f in glob.glob("src/data/practice/**/*.json", recursive=True):
    p = Path(f).parts
    if len(p) < 6:
        continue
    fn = Path(f).name
    d = json.load(open(f, encoding="utf-8"))
    for g in d.get("groups", []):
        bank_labels = {o.get("label") for o in (g.get("sharedBank") or [])}
        seen_expl = {}
        for q in g.get("questions", []):
            nq += 1
            qid = q.get("id")
            typ = q.get("type", "?")
            ca = q.get("correctAnswer", "")
            ex = q.get("explanation", "") or ""
            tag = f"{fn}:{qid}"
            # required prompt
            if typ not in PROMPT_OPTIONAL and not (q.get("prompt", "") or "").strip():
                # writing-essay uses prompt; translation uses sourceText as the body
                if not (typ == "translation-passage" and (q.get("sourceText") or "").strip()):
                    issues["empty_prompt"].append(f"{tag} [{typ}]")
            # answer validity
            if typ in LABEL_TYPES:
                avail = {o.get("label") for o in (q.get("options") or [])} or bank_labels
                if not ca:
                    issues["empty_answer"].append(f"{tag} [{typ}]")
                elif ca not in avail:
                    issues["answer_not_in_options"].append(f"{tag} [{typ}] ans={ca} avail={sorted(avail)}")
            elif typ in TF_TYPES:
                if ca not in ("对", "错"):
                    issues["tf_bad_value"].append(f"{tag} ans={ca!r}")
                else:
                    is_mis = any(k in ex for k in MISMATCH_KW)
                    is_match = (not is_mis) and any(k in ex for k in MATCH_KW)
                    if (is_mis and ca == "对") or (is_match and ca == "错"):
                        issues["tf_contradiction"].append(f"{tag} ans={ca} expl={ex[:46]}")
            elif typ in TEXT_TYPES:
                if not (ca or q.get("sample") or "").strip():
                    issues["empty_answer"].append(f"{tag} [{typ}]")
            else:
                issues["unknown_type"].append(f"{tag} [{typ}]")
            # duplicate explanation within group
            if ex.strip():
                if ex in seen_expl:
                    issues["dup_explanation"].append(f"{tag} == {seen_expl[ex]}")
                else:
                    seen_expl[ex] = qid

# grammar
ng = 0
for f in glob.glob("src/data/grammar/hsk*.json"):
    for pt in json.load(open(f, encoding="utf-8")):
        ng += 1
        for i, dr in enumerate(pt.get("drills", [])):
            if len(dr.get("options", [])) != 4 or not isinstance(dr.get("answerIndex"), int) or not (0 <= dr["answerIndex"] < 4):
                issues["grammar_drill"].append(f"{pt['id']} d{i}")

print(f"scanned {nq} practice questions + {ng} grammar points\n")
total = 0
for k in ["empty_answer", "answer_not_in_options", "tf_bad_value", "tf_contradiction",
          "unknown_type", "empty_prompt", "dup_explanation", "grammar_drill"]:
    v = issues.get(k, [])
    total += len(v)
    print(f"=== {k}: {len(v)} ===")
    for x in v[:8]:
        print("   ", x)
    if len(v) > 8:
        print(f"    ... +{len(v)-8} more")
print(f"\nTOTAL ISSUES: {total}")
