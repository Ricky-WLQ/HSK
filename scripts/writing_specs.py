# -*- coding: utf-8 -*-
"""Per-part WRITING/TRANSLATION specs (书写/写作/翻译), grounded in the official samples.
Four content modes:
  fill-char  : a sentence with one character blanked (shown as （pinyin）); write the char. AUTO-graded.
  sentence   : a picture + a given word; write one sentence. AI-graded (sample provided). Image (VLM-grounded).
  essay      : a topic (optionally 4 narrative panels) → essay of ≥minChars. AI-graded (sample provided).
  translation: translate the English source into Chinese. AI-graded (sample provided).

Deferred (noted, not built): HSK2 书写 P1 (ambiguous in the OCR sample) and HSK7-9 写作 P1
(chart description — a data chart inherently needs text/numbers, which conflicts with the
image pipeline's OCR-reject).
"""
from reading_specs import cumulative_vocab  # noqa: F401  (re-exported for the generator)

FILL_SCHEMA = (
    ' Return STRICT JSON: {"instruction":"<中文 directions>","items":[{"sentence":"<完整中文句子>",'
    '"blank":"<句中要挖空的一个汉字>","pinyin":"<该字的拼音>"},... 5 items]}. The blank char must actually '
    "appear in its sentence; pick a common, level-appropriate character. Sentences are natural and distinct."
)
SENTENCE_SCHEMA = (
    ' Return STRICT JSON: {"instruction":"<中文 directions>","items":[{"word":"<给定词语>",'
    '"scene":"<english scene that clearly depicts a situation where this word fits — subject + action, '
    'drawable WITHOUT any text/numbers>","sample":"<用该词语写的一个参考句子>"},... 5 items]}. '
    "Each word is concrete and picture-able; the sample sentence naturally uses the word and fits the scene."
)


def essay_schema(panels):
    if panels:
        return (
            ' Return STRICT JSON: {"instruction":"<作文题目要求, 中文>","panels":["<panel1 english scene>",'
            '"<panel2>","<panel3>","<panel4>"],"sample":"<参考范文，叙述这四幅图的故事>"}. The 4 panels form ONE '
            "coherent story (consistent character/setting), each drawable WITHOUT text. The sample narrates them."
        )
    return (
        ' Return STRICT JSON: {"instruction":"<作文题目要求, 中文, 含字数要求>","sample":"<参考范文>"}. '
        "The instruction is a self-contained writing prompt; the sample is a strong model answer meeting the length."
    )


TRANSLATION_SCHEMA = (
    ' Return STRICT JSON: {"instruction":"<中文 directions>","passages":[{"source":"<English passage ~120-160 '
    'words, general/academic register>","sample":"<忠实流畅的中文参考译文>"},... 2 passages]}.'
)


def _W(level, part, wtype, titleZh, n, minChars, prompt, **kw):
    return {"level": level, "partKey": part, "wtype": wtype, "titleZh": titleZh, "nItems": n,
            "minChars": minChars, "prompt": prompt, "image": kw.get("image", False),
            "panels": kw.get("panels", 0), "minVocab": kw.get("minVocab", 0.80)}


SPECS = [
    # ---- HSK2 (书写; P1 deferred — ambiguous OCR) ----
    _W("2", "writing-p2", "fill-char", "书写 第二部分（写汉字）", 5, 0,
       lambda lv: "Write 5 HSK2 fill-the-character items (HSK2 vocabulary ~300 words, short sentences)." + FILL_SCHEMA,
       minVocab=0.74),

    # ---- HSK3 (书写) ----
    _W("3", "writing-p1", "fill-char", "书写 第一部分（写汉字）", 5, 0,
       lambda lv: "Write 5 HSK3 fill-the-character items (HSK3 vocabulary, everyday sentences)." + FILL_SCHEMA,
       minVocab=0.80),
    _W("3", "writing-p2", "sentence", "书写 第二部分（看图写句子）", 5, 0,
       lambda lv: "Write 5 HSK3 picture-sentence items: each a concrete everyday word + a scene + a model sentence."
       + SENTENCE_SCHEMA, image=True, minVocab=0.80),

    # ---- HSK4 (写作) ----
    _W("4", "writing-p1", "sentence", "写作 第一部分（看图写句子）", 5, 0,
       lambda lv: "Write 5 HSK4 picture-sentence items: a concrete word + a scene + a model sentence using the word."
       + SENTENCE_SCHEMA, image=True, minVocab=0.85),
    _W("4", "writing-p2", "essay", "写作 第二部分（短文写作）", 1, 80,
       lambda lv: "Write ONE HSK4 short-essay prompt (≥80字) on an everyday topic, plus a model answer (~100字)."
       + essay_schema(0), minVocab=0.0),

    # ---- HSK5 (写作) ----
    _W("5", "writing-p1", "essay", "写作 第一部分（看图写作）", 1, 100,
       lambda lv: "Write ONE HSK5 four-panel narrative task (≥100字): 4 story panels + a model narrative (~150字)."
       + essay_schema(4), image=True, panels=4, minVocab=0.0),
    _W("5", "writing-p2", "essay", "写作 第二部分（议论文）", 1, 200,
       lambda lv: "Write ONE HSK5 argumentative-essay prompt (≥200字) on a thoughtful topic, plus a model answer (~250字)."
       + essay_schema(0), minVocab=0.0),

    # ---- HSK6 (写作) ----
    _W("6", "writing-p1", "essay", "写作 第一部分（应用文）", 1, 150,
       lambda lv: "Write ONE HSK6 practical-writing task (≥150字, e.g. notice/letter/post) with concrete requirements, "
       "plus a model answer (~180字)." + essay_schema(0), minVocab=0.0),
    _W("6", "writing-p2", "essay", "写作 第二部分（议论文）", 1, 300,
       lambda lv: "Write ONE HSK6 argumentative-essay prompt (≥300字) on a societal/abstract topic, plus a model answer "
       "(~350字)." + essay_schema(0), minVocab=0.0),

    # ---- HSK7-9 (写作 P2 essay + 翻译; 写作 P1 chart deferred) ----
    _W("7-9", "writing-p2", "essay", "写作 第二部分（话题作文）", 1, 600,
       lambda lv: "Write ONE HSK7-9 topic essay prompt (~600字), often citing a saying/quote, plus a model answer "
       "(~600字)." + essay_schema(0), minVocab=0.0),
    _W("7-9", "translation-p1", "translation", "翻译 第一部分（英译中）", 2, 0,
       lambda lv: "Write 2 HSK7-9 English→Chinese translation passages with faithful model translations."
       + TRANSLATION_SCHEMA, minVocab=0.0),
]
