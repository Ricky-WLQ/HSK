# -*- coding: utf-8 -*-
"""Per-(level, part) LISTENING item specs, grounded in the official new-format
samples (新版HSK（1-6级）考试结构与样题示例 + HSK7-9). Each spec drives one practice
GROUP. DeepSeek produces Chinese content (a spoken transcript + questions); audio is
synthesized later with multi-voice Edge-TTS (scripts/listening_audio.py); pinyin is
added programmatically to the VISIBLE text only (never the hidden transcript).

audio_mode decides how audio + questions relate:
  per-item-monologue : each question carries its OWN 1-speaker audio (narrator)
  per-item-dialogue  : each question carries its OWN 男/女 dialogue audio
  clustered-monologue: ONE shared monologue passage audio for all questions in the group
  clustered-dialogue : ONE shared 男/女 dialogue (e.g. interview) for all questions

DeepSeek returns STRICT JSON. Per-item modes:
  {"instruction": "...",
   "items": [ {"lines": [{"speaker":"男|女|旁白","text":"..."}],   # the audio for THIS item
               "prompt": "<printed question stem, may be empty for picture-match>",
               "options": [{"label":"A","text":"..."}],            # omitted for true/false & picture-match
               "correctAnswer": "<A.. | 对 | 错>",
               "imagePrompts": {"A":"<english scene>", ...} | "<english scene>",  # picture parts only
               "explanation": "<中文解析>"} ] }
Clustered modes:
  {"instruction": "...",
   "passageLines": [{"speaker":"...","text":"..."}],               # the shared audio
   "questions": [ {"prompt":"...","options":[...],"correctAnswer":"A","explanation":"..."} ] }
"""
from reading_specs import cumulative_vocab  # noqa: F401  (re-exported for the generator)

# Speaker label -> tts voice key (matches scripts/listening_audio.py VOICES).
SPEAKER_VOICE = {"男": "male", "女": "female", "旁白": "narrator", "narrator": "narrator"}


def _opts_schema(n):
    letters = "ABCDEFG"[:n]
    return (
        '"options":[' + ",".join(f'{{"label":"{c}","text":"<选项>"}}' for c in letters) + "],"
        f'"correctAnswer":"<{"/".join(letters)}>"'
    )


# ---- per-item schema builders -------------------------------------------------
def _mono_mcq_item(nopt):
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>","items":[{'
        '"lines":[{"speaker":"旁白","text":"<一段独白，听力原文>"}],'
        '"prompt":"<根据录音提出的★问题>",' + _opts_schema(nopt) + ',"explanation":"<中文解析，不要出现选项字母>"}]}. '
        "Each item is independent: a short narrator monologue, then a printed question with exactly "
        f"{nopt} options, one correct. The transcript is in `lines` (it is NOT shown to the learner)."
    )


def _dialog_mcq_item(nopt):
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>","items":[{'
        '"lines":[{"speaker":"男","text":"..."},{"speaker":"女","text":"..."}],'
        '"prompt":"<根据对话提出的★问题>",' + _opts_schema(nopt) + ',"explanation":"<中文解析，不要出现选项字母>"}]}. '
        "Each item is an independent 男/女 dialogue (2-4 turns) followed by a printed question with exactly "
        f"{nopt} options, one correct."
    )


def _pic_tf_item():
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>","items":[{'
        '"lines":[{"speaker":"旁白","text":"<一句陈述，听力原文>"}],'
        '"prompt":"",'
        '"imagePrompts":"<a concrete ENGLISH scene description to draw, matching OR mismatching the statement>",'
        '"correctAnswer":"<对 if the picture matches the statement, 错 if not>",'
        '"explanation":"<中文解析>"}]}. '
        "Each item: a one-sentence spoken statement + ONE picture. Make about half the items 对 (picture matches) "
        "and half 错 (picture shows something clearly different). imagePrompts is the scene to draw — a concrete "
        "ENGLISH description of a SINGLE everyday object/action that can be drawn WITHOUT any text, numbers, digital "
        "clocks, calendars, signs, or labels (avoid statements about specific times/prices that force digits)."
    )


def _pic_match_item(bank):
    letters = "ABCDEF"[:bank]
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>","sharedImages":{'
        + ",".join(f'"{c}":"<english scene to draw for picture {c}>"' for c in letters)
        + '},"items":[{"lines":[{"speaker":"男","text":"..."},{"speaker":"女","text":"..."}],'
        '"correctAnswer":"<the picture letter this dialogue matches>","explanation":"<中文解析>"}]}. '
        f"There are {bank} shared pictures (A-{letters[-1]}); each of the items is a short 男/女 dialogue that "
        "clearly matches exactly ONE picture. Every picture is used by at most one item; one picture is an unused "
        "distractor. sharedImages are concrete English scene descriptions of SINGLE everyday objects/actions, each "
        "drawable WITHOUT any text, numbers, signs, or labels."
    )


# ---- clustered schema builders ------------------------------------------------
def _mono_cluster(nopt, nq):
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>",'
        '"passageLines":[{"speaker":"旁白","text":"<一段较长独白，听力原文>"}],'
        '"questions":[{"prompt":"<★问题>",' + _opts_schema(nopt) + ',"explanation":"<中文解析，不要出现选项字母>"}]}. '
        f"ONE narrator monologue/passage, then {nq} printed questions about it, each with exactly {nopt} options, "
        "one correct. The passage transcript is in passageLines (NOT shown to the learner)."
    )


def _dialog_cluster(nopt, nq):
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>",'
        '"passageLines":[{"speaker":"女","text":"..."},{"speaker":"男","text":"..."}],'
        '"questions":[{"prompt":"<★问题>",' + _opts_schema(nopt) + ',"explanation":"<中文解析，不要出现选项字母>"}]}. '
        f"ONE longer 男/女 dialogue (interview style, several turns), then {nq} printed questions, each with exactly "
        f"{nopt} options, one correct."
    )


def _statement_tf(nq):
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>",'
        '"passageLines":[{"speaker":"旁白","text":"<一段较长独白，听力原文>"}],'
        '"questions":[{"prompt":"<一句根据录音的判断句>","correctAnswer":"<对/错>","explanation":"<中文解析>"}]}. '
        f"ONE narrator passage, then {nq} printed statements; mark each 对 (matches the passage) or 错 (does not). "
        "Make roughly half 对 and half 错."
    )


def _mixed_cluster(nq):
    return (
        'Return STRICT JSON {"instruction":"<中文 directions>",'
        '"passageLines":[{"speaker":"旁白","text":"<一段独白，听力原文>"}],'
        '"questions":[{"prompt":"<★问题>","kind":"<mcq|blank>",'
        '"options":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],'
        '"correctAnswer":"<A-D for mcq; a short ≤6字 answer for blank>","explanation":"<中文解析>"}]}. '
        f"ONE narrator passage, then {nq} questions. Most are 4-option MCQ (kind=mcq); 1-2 are short fill-in-the-blank "
        "(kind=blank, omit options, correctAnswer is the ≤6-character answer extractable from the passage)."
    )


def _L(level, part, typ, titleZh, nq, audio_mode, prompt, **kw):
    spec = {
        "level": level, "partKey": part, "type": typ,
        "title": f"HSK{level} Listening {part.split('-')[-1].upper()}", "titleZh": titleZh,
        "nQuestions": nq, "audioMode": audio_mode, "prompt": prompt,
        "options": kw.get("options"), "sharedBank": kw.get("sharedBank"),
        "image": kw.get("image", False), "minVocab": kw.get("minVocab", 0.85),
    }
    return spec


# Image-bearing parts are flagged image=True; they additionally drive picture generation.
SPECS = [
    # ---- HSK1 (听力 20) ----
    _L("1", "listening-p1", "listening-picture-true-false", "听力 第一部分（看图判断）", 5,
       "per-item-monologue",
       lambda lv: "Write 5 independent HSK1 listening picture-judgement items. Each: one short spoken statement "
       "(HSK1 vocabulary, ~150 words) + one picture; learner judges 对/错. " + _pic_tf_item(),
       image=True, minVocab=0.70),
    _L("1", "listening-p2", "listening-mcq", "听力 第二部分（听句子选答语）", 5,
       "per-item-monologue",
       lambda lv: "Write 5 independent HSK1 listening items. Each: a short spoken sentence/question (HSK1 vocab) and "
       "3 short text options (A/B/C). " + _mono_mcq_item(3), options=3, minVocab=0.70),
    _L("1", "listening-p3", "listening-picture-match", "听力 第三部分（看图听对话）", 5,
       "per-item-dialogue",
       lambda lv: "Write an HSK1 listening picture-matching group: 6 pictures (A-F) and 5 short 男/女 dialogues "
       "(HSK1 vocab), each matching one picture. " + _pic_match_item(6), sharedBank=6, image=True, minVocab=0.70),
    _L("1", "listening-p4", "listening-mcq", "听力 第四部分（听问句选答案）", 5,
       "per-item-monologue",
       lambda lv: "Write 5 independent HSK1 listening items. Each: a short spoken statement then a spoken question, "
       "with 3 text options (A/B/C). " + _mono_mcq_item(3), options=3, minVocab=0.70),

    # ---- HSK2 (听力 25) ----
    _L("2", "listening-p1", "listening-picture-true-false", "听力 第一部分（看图判断）", 5,
       "per-item-monologue",
       lambda lv: "Write 5 independent HSK2 listening picture-judgement items (HSK2 vocab ~300). Statement + one "
       "picture; judge 对/错. " + _pic_tf_item(), image=True, minVocab=0.74),
    _L("2", "listening-p2", "listening-picture-match", "听力 第二部分（看图听对话）", 10,
       "per-item-dialogue",
       lambda lv: "Write an HSK2 picture-matching group: 6 pictures (A-F) and 10 short 男/女 dialogues, each matching "
       "one picture (pictures may repeat across the 10 since bank<items — instead give 10 dialogues and 6 pictures "
       "where each dialogue matches one picture; reuse is allowed). " + _pic_match_item(6),
       sharedBank=6, image=True, minVocab=0.74),
    _L("2", "listening-p3", "listening-mcq", "听力 第三部分（听对话选答案）", 10,
       "per-item-dialogue",
       lambda lv: "Write 10 independent HSK2 listening items: a 男/女 dialogue then a spoken question, 3 text options "
       "(A/B/C). " + _dialog_mcq_item(3), options=3, minVocab=0.74),

    # ---- HSK3 (听力 30) ----
    _L("3", "listening-p1", "listening-picture-match", "听力 第一部分（看图听对话）", 10,
       "per-item-dialogue",
       lambda lv: "Write an HSK3 picture-matching group: 6 pictures (A-F) and 10 short 男/女 dialogues, each matching "
       "one picture. " + _pic_match_item(6), sharedBank=6, image=True, minVocab=0.80),
    _L("3", "listening-p2", "listening-mcq", "听力 第二部分（听对话选答案）", 10,
       "per-item-dialogue",
       lambda lv: "Write 10 independent HSK3 listening items: a 男/女 dialogue (2-4 turns) then a spoken question, "
       "3 text options (A/B/C). " + _dialog_mcq_item(3), options=3, minVocab=0.80),
    _L("3", "listening-p3", "listening-mcq", "听力 第三部分（听短文选答案）", 10,
       "per-item-monologue",
       lambda lv: "Write 10 independent HSK3 listening items: a short narrator passage then a spoken question, 3 "
       "text options (A/B/C). " + _mono_mcq_item(3), options=3, minVocab=0.80),

    # ---- HSK4 (听力 32) ----
    _L("4", "listening-p1", "listening-mcq", "听力 第一部分（听对话选答案）", 14,
       "per-item-dialogue",
       lambda lv: "Write 14 independent HSK4 listening items: a 男/女 dialogue then a spoken question, 4 text options "
       "(A/B/C/D). " + _dialog_mcq_item(4), options=4, minVocab=0.85),
    _L("4", "listening-p2", "listening-mcq", "听力 第二部分（听短文选答案）", 6,
       "clustered-monologue",
       lambda lv: "Write an HSK4 listening passage group: ONE narrator passage and 6 questions about it, 4 options "
       "each. " + _mono_cluster(4, 6), options=4, minVocab=0.85),

    # ---- HSK5 (听力 35) ----
    _L("5", "listening-p1", "listening-mcq", "听力 第一部分（听对话选答案）", 10,
       "per-item-dialogue",
       lambda lv: "Write 10 independent HSK5 listening items: a 男/女 dialogue then a spoken question, 4 options. "
       + _dialog_mcq_item(4), options=4, minVocab=0.86),
    _L("5", "listening-p2", "listening-mcq", "听力 第二部分（听短文选答案）", 6,
       "clustered-monologue",
       lambda lv: "Write an HSK5 listening passage group: ONE longer narrator narrative and 6 questions, 4 options. "
       + _mono_cluster(4, 6), options=4, minVocab=0.86),

    # ---- HSK6 (听力 40) ----
    _L("6", "listening-p1", "listening-mcq", "听力 第一部分（听新闻选答案）", 8,
       "per-item-monologue",
       lambda lv: "Write 8 independent HSK6 listening news items: a short news-style narrator passage; the question "
       "asks which option best matches the passage; 4 options. " + _mono_mcq_item(4), options=4, minVocab=0.87),
    _L("6", "listening-p2", "listening-mcq", "听力 第二部分（听长文选答案）", 5,
       "clustered-monologue",
       lambda lv: "Write an HSK6 expository passage group: ONE long narrator passage and 5 questions, 4 options. "
       + _mono_cluster(4, 5), options=4, minVocab=0.87),
    _L("6", "listening-p3", "listening-mcq", "听力 第三部分（听访谈选答案）", 5,
       "clustered-dialogue",
       lambda lv: "Write an HSK6 interview group: ONE long 男/女 interview (several turns) and 5 questions, 4 options. "
       + _dialog_cluster(4, 5), options=4, minVocab=0.87),

    # ---- HSK7-9 (听力 40) ----
    _L("7-9", "listening-p1", "listening-statement-true-false", "听力 第一部分（判断对错）", 5,
       "clustered-monologue",
       lambda lv: "Write an HSK7-9 listening judgement group: ONE long narrator passage (news/feature) and 5 printed "
       "statements judged 对/错. " + _statement_tf(5), minVocab=0.88),
    _L("7-9", "listening-p2", "listening-mcq", "听力 第二部分（听短文选填答案）", 6,
       "clustered-monologue",
       lambda lv: "Write an HSK7-9 sci/tech feature group: ONE narrator passage and 6 questions, mostly 4-option MCQ "
       "with 1-2 short fill-in-the-blank. " + _mixed_cluster(6), options=4, minVocab=0.88),
    _L("7-9", "listening-p3", "listening-mcq", "听力 第三部分（听讲座选填答案）", 6,
       "clustered-monologue",
       lambda lv: "Write an HSK7-9 lecture group: ONE narrator lecture passage and 6 questions, mostly 4-option MCQ "
       "with 1-2 short fill-in-the-blank. " + _mixed_cluster(6), options=4, minVocab=0.88),
]
