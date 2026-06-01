import fs from "node:fs/promises";
import path from "node:path";

// HSK 3.0 exam/practice content model. Grounded in the official new-format item
// types (新版HSK考试样题). A practice set is a list of GROUPS; a group is a "part"
// or a passage-with-questions unit that may carry a shared passage and/or a shared
// A–F option bank. This structured shape avoids the brittle context-string parsing
// the reference CET app used.

export const HSK_SECTIONS = ["listening", "reading", "writing", "translation", "speaking"] as const;
export type HskSection = (typeof HSK_SECTIONS)[number];

// Reading item types across HSK 1–9 (see scripts/generate-reading.py for the format spec):
//  match            — match a sentence/question to one option in the shared A–F bank
//  cloze-wordbank   — sentence/dialogue with a blank; pick the word from the shared A–F bank
//  passage-mcq      — a passage + a ★question with 3–4 per-question options
//  cloze-insert     — a passage with numbered blanks; insert the right candidate sentence
//  cloze-paragraph  — a passage with blanks; each blank has its own 4 options
//  ordering         — reorder scrambled paragraphs (answer = a paragraph letter per position)
//  short-answer     — free-write ≤10 chars (HSK7–9); AI-graded
//  image-match      — pick the matching image (HSK1–2 reading P1)
// Listening item types (see scripts/generate-listening.py):
//  listening-picture-true-false  — hear a statement, judge if ONE shown picture matches (correctAnswer "对"/"错")
//  listening-picture-match       — hear a dialogue, match it to a picture in the shared A–F image bank
//  listening-mcq                 — hear audio (+ spoken question); pick from 3–4 text options
//  listening-statement-true-false— hear a passage, judge a PRINTED statement (correctAnswer "对"/"错"); HSK7–9
//  listening-dictation           — hear audio, free-write a short answer; AI-graded; HSK7–9
// Writing/translation item types (see scripts/generate-writing.py):
//  writing-fill-char  — sentence with a （pinyin） blank; write the missing character (correctAnswer); AUTO-graded
//  writing-sentence   — a picture + a given word; write one sentence using the word; AI-graded (sample provided)
//  writing-essay      — a topic (optionally 4 panels) → write an essay of ≥minChars; AI-graded
//  translation-passage— translate the English sourceText into Chinese; AI-graded (sample provided)
export type HskQuestionType =
  | "match"
  | "cloze-wordbank"
  | "passage-mcq"
  | "cloze-insert"
  | "cloze-paragraph"
  | "ordering"
  | "short-answer"
  | "image-match"
  | "listening-picture-true-false"
  | "listening-picture-match"
  | "listening-mcq"
  | "listening-statement-true-false"
  | "listening-dictation"
  | "writing-fill-char"
  | "writing-sentence"
  | "writing-essay"
  | "translation-passage";

export interface HskOption {
  label: string; // "A".."G"
  text: string; // option / paragraph / response text (Chinese)
  pinyin?: string;
  imageUrl?: string; // picture-match bank: this option is an image, not (or in addition to) text
}

// One spoken turn. voice maps to src/lib/tts.ts VOICES (narrator/male/female).
export interface HskAudioLine {
  speaker?: string; // "男" / "女" / narrator label (display only)
  voice?: "narrator" | "male" | "female";
  text: string;
}

// A pre-generated, pre-concatenated audio clip (built at generation time, stored in R2).
export interface HskAudio {
  key: string; // R2 key of the concatenated mp3 (served via /api/listening-audio)
  lines: HskAudioLine[]; // the turns that compose the clip (also the review transcript)
  transcript?: string; // flat transcript for review/explanation (hidden during play)
  transcriptPinyin?: string; // HSK1–3 review pinyin
}

export interface HskQuestion {
  id: string; // e.g. "q1"
  type: HskQuestionType;
  prompt: string; // the stem: ★question / sentence-with-blank / statement-to-match / position label
  pinyin?: string; // pinyin of the prompt (HSK1–3)
  options?: HskOption[]; // per-question options (passage-mcq, cloze-paragraph, cloze-insert, listening-mcq)
  correctAnswer: string; // option letter(s) for MCQ/match/cloze; "对"/"错" for true-false; reference text for short-answer/dictation
  acceptableAnswers?: string[]; // short-answer / dictation accepted variants
  explanation?: string; // Chinese explanation of the answer
  imageUrl?: string; // single shown picture (listening-picture-true-false / image-match prompt picture / writing-sentence)
  audio?: HskAudio; // item-level audio (independent listening items, HSK1–3)
  // Writing / translation fields:
  givenWord?: string; // writing-sentence: the word the learner must use
  minChars?: number; // writing-essay: minimum character count
  sourceText?: string; // translation-passage: the English text to translate
  sample?: string; // AI-graded reference answer (sentence / essay / translation) shown after grading
  images?: string[]; // writing-essay 4-panel narrative: ordered panel image URLs
  rubric?: string; // grading guidance for the AI grader (per item)
}

export interface HskGroup {
  id: string;
  instruction: string; // part directions (Chinese)
  passage?: string; // shared passage text (passage-mcq / cloze-insert / cloze-paragraph)
  passagePinyin?: string;
  sharedBank?: HskOption[]; // shared A–F bank (match / cloze-wordbank / cloze-insert / ordering / picture-match images)
  questions: HskQuestion[];
  audio?: HskAudio; // passage-level audio shared by a cluster of questions (HSK4+ listening)
}

export interface HskPracticeSet {
  id: string; // e.g. "hsk3-reading-001"
  level: string; // "1".."6","7-9"
  section: HskSection;
  partKey: string; // e.g. "reading-p1" — which official part this set drills
  title: string; // English title
  titleZh: string; // Chinese title
  groups: HskGroup[];
  source: string;
}

export interface HskSetMeta {
  id: string;
  level: string;
  section: HskSection;
  partKey: string;
  title: string;
  titleZh: string;
  questionCount: number;
}

export interface HskPracticeIndex {
  generated: string; // ISO date stamp (build-time)
  sets: HskSetMeta[];
}

const PRACTICE_DIR = path.join(process.cwd(), "src", "data", "practice");

// Static read-only data → parse once per process.
let _index: HskPracticeIndex | null = null;
const _sets = new Map<string, HskPracticeSet>();

export async function getPracticeIndex(): Promise<HskPracticeIndex> {
  if (_index) return _index;
  try {
    const raw = await fs.readFile(path.join(PRACTICE_DIR, "index.json"), "utf-8");
    _index = JSON.parse(raw) as HskPracticeIndex;
  } catch {
    _index = { generated: "", sets: [] };
  }
  return _index;
}

export async function getPracticeSetsForLevel(
  level: string,
  section: HskSection,
): Promise<HskSetMeta[]> {
  const idx = await getPracticeIndex();
  return idx.sets.filter((s) => s.level === level && s.section === section);
}

export async function getPracticeSet(setId: string): Promise<HskPracticeSet | null> {
  const cached = _sets.get(setId);
  if (cached) return cached;
  // setId shape: hsk{level}-{section}-p{NN}; file at practice/hsk{level}/{section}/{setId}.json
  // level may contain a hyphen ("7-9"); the part suffix is like "p301".
  const m = setId.match(/^hsk([\d-]+)-(listening|reading|writing|translation|speaking)-[a-z]*\d+$/);
  if (!m) return null;
  const [, level, section] = m;
  try {
    const raw = await fs.readFile(
      path.join(PRACTICE_DIR, `hsk${level}`, section, `${setId}.json`),
      "utf-8",
    );
    const set = JSON.parse(raw) as HskPracticeSet;
    _sets.set(setId, set);
    return set;
  } catch {
    return null;
  }
}

/** Total questions in a set (across groups). */
export function countQuestions(set: HskPracticeSet): number {
  return set.groups.reduce((n, g) => n + g.questions.length, 0);
}

/** Auto-gradable types are graded by exact match; free-write/produced types are AI-graded. */
const AI_GRADED: ReadonlySet<HskQuestionType> = new Set<HskQuestionType>([
  "short-answer",
  "listening-dictation",
  "writing-sentence",
  "writing-essay",
  "translation-passage",
]);
export function isAutoGradable(type: HskQuestionType): boolean {
  return !AI_GRADED.has(type);
}
