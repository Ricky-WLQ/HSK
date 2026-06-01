# -*- coding: utf-8 -*-
"""Per-(level, part) reading item specs, grounded in the official new-format
samples (新版HSK考试样题). Each spec drives one practice GROUP. DeepSeek produces
Chinese content only; pinyin is added programmatically (pypinyin) for HSK1-3.

Schema DeepSeek must return (STRICT JSON):
  { "instruction": "<part directions, Chinese>",
    "passage": "<passage, for passage-mcq/cloze-insert/cloze-paragraph>",
    "sharedBank": [ {"label":"A","text":"..."}, ... ],   # for match / cloze-wordbank
    "questions": [ {"prompt":"<stem>", "options":[{"label":"A","text":"..."}...],
                    "correctAnswer":"A", "explanation":"<中文解析>"} ] }
"""
import glob
import json
import os

HSK_ORDER = ["1", "2", "3", "4", "5", "6", "7-9"]


def cumulative_vocab(level, root):
    """(words, chars) for all HSK levels up to and including `level`. `chars` is the
    set of every character used in those words — a reader at this level knows them,
    so a compound built from known characters is level-appropriate."""
    words, chars = set(), set()
    upto = HSK_ORDER.index(level)
    for lv in HSK_ORDER[: upto + 1]:
        try:
            for w in json.load(open(os.path.join(root, "src", "data", "vocab", f"hsk{lv}.json"), encoding="utf-8")):
                words.add(w["hanzi"])
                for c in w["hanzi"]:
                    chars.add(c)
        except Exception:
            pass
    return words, chars


def _match_schema(bank, nq, distractor):
    extra = (
        f"{nq} of the {bank} options are correct matches (one each); the remaining option(s) are plausible "
        "distractor(s) used by no question."
        if distractor else f"All {bank} options are used, exactly one per question."
    )
    return (
        'Return STRICT JSON: {"instruction":"<Chinese directions>",'
        '"sharedBank":[{"label":"A","text":"<句>"},... ' + str(bank) + " items],"
        '"questions":[{"prompt":"<提问句/陈述句>","correctAnswer":"<letter>","explanation":"<中文解析>"},... '
        + str(nq) + " items]}. Each question maps to exactly one option. " + extra
    )


def _cloze_wb_schema(bank, nq, distractor):
    extra = (
        f"One bank word fits no blank (distractor)." if distractor else "Every bank word fills exactly one blank."
    )
    return (
        'Return STRICT JSON: {"instruction":"<Chinese directions>",'
        '"sharedBank":[{"label":"A","text":"<词语>"},... ' + str(bank) + " items],"
        '"questions":[{"prompt":"<含一个括号（ ）空白的句子>","correctAnswer":"<letter>","explanation":"<中文解析>"},... '
        + str(nq) + " items]}. Each blank has exactly one grammatically + semantically correct bank word. " + extra
    )


def _mcq_schema(nq, nopt):
    return (
        'Return STRICT JSON: {"instruction":"<Chinese directions>","passage":"<短文>",'
        '"questions":[{"prompt":"<★理解问题>","options":[{"label":"A","text":"<选项>"},... ' + str(nopt) + " options],"
        '"correctAnswer":"<letter>","explanation":"<中文解析，引用原文>"},... ' + str(nq) + " items]}. "
        "Each question has exactly " + str(nopt) + " options and one correct answer supported by the passage. "
        "Distractors must be plausible but unsupported or contradicted by the passage."
    )


def _sentence_mcq_schema(nq, nopt):
    # independent short items (no shared passage); each prompt carries its own mini-text + ★question
    return (
        'Return STRICT JSON: {"instruction":"<Chinese directions>",'
        '"questions":[{"prompt":"<一两句短文。★问题>","options":[{"label":"A","text":"<选项>"},... ' + str(nopt) + " options],"
        '"correctAnswer":"<letter>","explanation":"<中文解析>"},... ' + str(nq) + " items]}. "
        "Each question is self-contained: its prompt holds a 1-2 sentence mini-text followed by a ★question; "
        "exactly " + str(nopt) + " options; one correct answer supported by that mini-text."
    )


def _short_answer_schema(nq):
    return (
        'Return STRICT JSON: {"instruction":"<Chinese directions>","passage":"<较长说明文 ~400-600字>",'
        '"questions":[{"prompt":"<问题>","correctAnswer":"<参考答案，10字以内>","acceptableAnswers":["<变体>"],'
        '"explanation":"<中文解析，引用原文>"},... ' + str(nq) + " items]}. "
        "Answers are extractable/short-paraphrase from the passage, each ≤10 Chinese characters."
    )


def _R(level, part, typ, titleZh, nq, prompt, sharedBank=None, options=None, passage=False, minVocab=0.88):
    return {
        "level": level, "partKey": part, "type": typ,
        "title": f"HSK{level} Reading {part.split('-')[-1].upper()}", "titleZh": titleZh,
        "nQuestions": nq, "sharedBank": sharedBank, "options": options, "passage": passage,
        "minVocab": minVocab, "prompt": prompt,
    }


SPECS = [
    # ---- HSK1 (pinyin added programmatically; image-match Part1 deferred to image slice) ----
    _R("1", "reading-p2", "match", "阅读 第二部分（问答匹配）", 5,
       lambda lv: "Write an HSK1 reading question-and-response matching group: 6 short response sentences (A-F) and "
       "5 very short question/statement sentences; each pairs with one response. Use only HSK1 vocabulary (~150 words), "
       "3-8 characters per sentence. " + _match_schema(6, 5, True), sharedBank=6, minVocab=0.92),
    _R("1", "reading-p3", "cloze-wordbank", "阅读 第三部分（选词填空）", 5,
       lambda lv: "Write an HSK1 word-bank cloze group: 6 single words (A-F) and 5 very short sentences each with one "
       "blank （ ）. HSK1 vocabulary only, 5-10 characters per sentence. " + _cloze_wb_schema(6, 5, True),
       sharedBank=6, minVocab=0.92),
    _R("1", "reading-p4", "passage-mcq", "阅读 第四部分（短句理解）", 5,
       lambda lv: "Write 5 independent HSK1 reading items, each a single short sentence (8-15 chars) followed by a "
       "★question, with 3 options (A/B/C) that are single words/short phrases. HSK1 vocabulary only. "
       + _sentence_mcq_schema(5, 3), options=3, minVocab=0.92),

    # ---- HSK2 (image-match Part1 deferred) ----
    _R("2", "reading-p2", "cloze-wordbank", "阅读 第二部分（选词填空）", 5,
       lambda lv: "Write an HSK2 word-bank cloze group: 6 words (A-F) and 5 short sentences each with one blank （ ）. "
       "HSK2 vocabulary (~300 words). " + _cloze_wb_schema(6, 5, True), sharedBank=6, minVocab=0.90),
    _R("2", "reading-p3", "match", "阅读 第三部分（句子匹配）", 5,
       lambda lv: "Write an HSK2 sentence-matching group: 6 utterances (A-F) and 5 question/statement sentences; each "
       "pairs with one utterance (natural conversational exchange). HSK2 vocabulary, ≤20 chars/sentence. "
       + _match_schema(6, 5, True), sharedBank=6, minVocab=0.90),
    _R("2", "reading-p4", "passage-mcq", "阅读 第四部分（短文理解）", 5,
       lambda lv: "Write 5 independent HSK2 reading items, each a 1-2 sentence mini-passage (≤30 chars) about a person, "
       "followed by a ★他/★她 question, with 3 options (A/B/C). HSK2 vocabulary. " + _sentence_mcq_schema(5, 3),
       options=3, minVocab=0.90),

    # ---- HSK3 ----
    _R("3", "reading-p1", "match", "阅读 第一部分（句子匹配）", 5,
       lambda lv: "Write an HSK3 sentence-matching group: 6 short sentences (A-F) and 5 question sentences; each "
       "logically pairs with one bank sentence. Everyday topics, ~10-20 chars, HSK3 vocabulary. "
       + _match_schema(6, 5, True), sharedBank=6, minVocab=0.85),
    _R("3", "reading-p2", "cloze-wordbank", "阅读 第二部分（词语填空）", 5,
       lambda lv: "Write an HSK3 word-bank cloze group: 6 words (A-F) and 5 short sentences each with one blank （ ）. "
       "HSK3 vocabulary, everyday topics. " + _cloze_wb_schema(6, 5, True), sharedBank=6, minVocab=0.85),
    _R("3", "reading-p3", "passage-mcq", "阅读 第三部分（短文理解）", 4,
       lambda lv: "Write an HSK3 short-passage group: ONE coherent passage ~80-130 chars (3-6 sentences), then 4 "
       "★questions, each 3 options (A/B/C). HSK3 vocabulary. " + _mcq_schema(4, 3), options=3, passage=True,
       minVocab=0.85),

    # ---- HSK4 ----
    _R("4", "reading-p1", "cloze-wordbank", "阅读 第一部分（选词填空）", 5,
       lambda lv: "Write an HSK4 word-bank cloze group: 5 words (A-E) and 5 sentences each with one blank （ ）; every "
       "word is used exactly once. HSK4 vocabulary. " + _cloze_wb_schema(5, 5, False), sharedBank=5, minVocab=0.85),
    _R("4", "reading-p2", "passage-mcq", "阅读 第二部分（短文理解）", 4,
       lambda lv: "Write an HSK4 passage group: ONE passage ~120-180 chars (a note/message/short narrative), then 4 "
       "★questions, each 4 options (A/B/C/D). HSK4 vocabulary. " + _mcq_schema(4, 4), options=4, passage=True,
       minVocab=0.85),
    _R("4", "reading-p3", "passage-mcq", "阅读 第二部分B（中篇理解）", 4,
       lambda lv: "Write an HSK4 medium-passage group: ONE passage ~180-260 chars, then 4 ★questions (detail, main "
       "idea, inference), each 4 options (A/B/C/D). HSK4 vocabulary. " + _mcq_schema(4, 4), options=4, passage=True,
       minVocab=0.85),

    # ---- HSK5 ----
    _R("5", "reading-p1", "passage-mcq", "阅读 第三部分（长文理解）", 5,
       lambda lv: "Write an HSK5 long-passage group: ONE passage ~300-450 chars (expository or narrative), then 5 "
       "★questions (vocabulary-in-context, detail, inference, attitude, main idea), each 4 options (A/B/C/D). "
       "HSK5 vocabulary. " + _mcq_schema(5, 4), options=4, passage=True, minVocab=0.88),
    _R("5", "reading-p2", "passage-mcq", "阅读 长文理解（二）", 5,
       lambda lv: "Write a second HSK5 long-passage group on a different topic (science/culture/society): ONE passage "
       "~300-450 chars, 5 ★questions, each 4 options (A/B/C/D). HSK5 vocabulary. " + _mcq_schema(5, 4),
       options=4, passage=True, minVocab=0.88),

    # ---- HSK6 ----
    _R("6", "reading-p1", "passage-mcq", "阅读 第三部分（长篇阅读）", 5,
       lambda lv: "Write an HSK6 long-passage group: ONE passage ~400-550 chars (social phenomenon / science / "
       "culture), then 5 ★questions (detail, inference, author's view, paragraph gist), each 4 options (A/B/C/D). "
       "HSK6 vocabulary. " + _mcq_schema(5, 4), options=4, passage=True, minVocab=0.90),
    _R("6", "reading-p2", "passage-mcq", "阅读 长篇阅读（二）", 5,
       lambda lv: "Write a second HSK6 long-passage group on a different topic: ONE passage ~400-550 chars, 5 "
       "★questions, each 4 options (A/B/C/D). HSK6 vocabulary. " + _mcq_schema(5, 4), options=4, passage=True,
       minVocab=0.90),

    # ---- HSK7-9 ----
    _R("7-9", "reading-p1", "passage-mcq", "阅读 第一部分（长篇阅读理解）", 6,
       lambda lv: "Write an HSK7-9 long academic/argumentative passage group: ONE passage ~500-750 chars, then 6 "
       "★questions (factual detail, inference, vocabulary-in-context, author's stance, structure), each 4 options "
       "(A/B/C/D). Advanced vocabulary. " + _mcq_schema(6, 4), options=4, passage=True, minVocab=0.92),
    _R("7-9", "reading-p3", "short-answer", "阅读 第三部分（简答题）", 5,
       lambda lv: "Write an HSK7-9 short-answer group: ONE expository passage ~400-600 chars (natural science / "
       "ecology / history), then 5 questions each answerable in ≤10 Chinese characters extracted/paraphrased from the "
       "passage. " + _short_answer_schema(5), passage=True, minVocab=0.92),
]
