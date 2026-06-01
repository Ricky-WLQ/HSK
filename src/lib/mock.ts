import {
  getPracticeSetsForLevel,
  getPracticeSet,
  countQuestions,
  type HskPracticeSet,
  type HskSection,
  type HskSetMeta,
} from "@/lib/exam";

// Official new-HSK 3.0 exam structure (verified against 新版HSK考试样题 考试结构 tables):
//   section · question count · minutes. HSK7-9 Speaking (口语) is intentionally
//   deferred (needs audio record/playback) — added in Phase 5.
export type MockSectionSpec = {
  section: HskSection;
  questions: number;
  minutes: number;
  labelEn: string;
};

export const MOCK_STRUCTURE: Record<string, MockSectionSpec[]> = {
  "1": [
    { section: "listening", questions: 20, minutes: 12, labelEn: "Listening" },
    { section: "reading", questions: 20, minutes: 20, labelEn: "Reading" },
  ],
  "2": [
    { section: "listening", questions: 25, minutes: 17, labelEn: "Listening" },
    { section: "reading", questions: 25, minutes: 25, labelEn: "Reading" },
    { section: "writing", questions: 10, minutes: 10, labelEn: "Writing (书写)" },
  ],
  "3": [
    { section: "listening", questions: 30, minutes: 23, labelEn: "Listening" },
    { section: "reading", questions: 30, minutes: 30, labelEn: "Reading" },
    { section: "writing", questions: 10, minutes: 20, labelEn: "Writing (书写)" },
  ],
  "4": [
    { section: "listening", questions: 32, minutes: 20, labelEn: "Listening" },
    { section: "reading", questions: 32, minutes: 30, labelEn: "Reading" },
    { section: "writing", questions: 6, minutes: 25, labelEn: "Writing (写作)" },
  ],
  "5": [
    { section: "listening", questions: 35, minutes: 25, labelEn: "Listening" },
    { section: "reading", questions: 35, minutes: 35, labelEn: "Reading" },
    { section: "writing", questions: 2, minutes: 40, labelEn: "Writing (写作)" },
  ],
  "6": [
    { section: "listening", questions: 40, minutes: 30, labelEn: "Listening" },
    { section: "reading", questions: 40, minutes: 40, labelEn: "Reading" },
    { section: "writing", questions: 2, minutes: 45, labelEn: "Writing (写作)" },
  ],
  "7-9": [
    { section: "listening", questions: 40, minutes: 30, labelEn: "Listening" },
    { section: "reading", questions: 47, minutes: 60, labelEn: "Reading" },
    { section: "writing", questions: 2, minutes: 55, labelEn: "Writing (写作)" },
    { section: "translation", questions: 4, minutes: 41, labelEn: "Translation (翻译)" },
  ],
};

/** Quick diagnostic = MCQ sections only (listening + reading), a few questions each. */
const DIAGNOSTIC_PER_SECTION = 8;

export type AssembledSection = {
  section: HskSection;
  labelEn: string;
  minutes: number;
  questionCount: number;
  sets: HskPracticeSet[];
};
export type AssembledExam = {
  level: string;
  mode: "full" | "diagnostic";
  sections: AssembledSection[];
  totalQuestions: number;
  totalMinutes: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick sets covering the official parts (by partKey) until the cumulative
 * question count reaches `target`. One pass takes a (shuffled) set from each
 * part in turn so all parts are represented; further passes top up the count.
 */
function pickSets(metas: HskSetMeta[], target: number): HskSetMeta[] {
  const byPart = new Map<string, HskSetMeta[]>();
  for (const m of metas) {
    if (!byPart.has(m.partKey)) byPart.set(m.partKey, []);
    byPart.get(m.partKey)!.push(m);
  }
  const queues = [...byPart.keys()].sort().map((k) => shuffle(byPart.get(k)!));
  const picked: HskSetMeta[] = [];
  let count = 0;
  let progress = true;
  while (count < target && progress) {
    progress = false;
    for (const q of queues) {
      if (count >= target) break;
      const m = q.shift();
      if (m) {
        picked.push(m);
        count += m.questionCount;
        progress = true;
      }
    }
  }
  return picked;
}

export async function assembleExam(
  level: string,
  mode: "full" | "diagnostic",
): Promise<AssembledExam> {
  const all = MOCK_STRUCTURE[level] ?? [];
  const specs =
    mode === "diagnostic"
      ? all.filter((s) => s.section === "listening" || s.section === "reading")
      : all;

  const sections: AssembledSection[] = [];
  for (const spec of specs) {
    const metas = await getPracticeSetsForLevel(level, spec.section);
    const target = mode === "diagnostic" ? Math.min(DIAGNOSTIC_PER_SECTION, spec.questions) : spec.questions;
    const picked = pickSets(metas, target);
    const sets = (await Promise.all(picked.map((m) => getPracticeSet(m.id)))).filter(
      (s): s is HskPracticeSet => s != null,
    );
    const questionCount = sets.reduce((n, s) => n + countQuestions(s), 0);
    const minutes =
      mode === "diagnostic"
        ? Math.max(4, Math.round((spec.minutes * target) / spec.questions))
        : spec.minutes;
    if (sets.length > 0) {
      sections.push({ section: spec.section, labelEn: spec.labelEn, minutes, questionCount, sets });
    }
  }
  return {
    level,
    mode,
    sections,
    totalQuestions: sections.reduce((n, s) => n + s.questionCount, 0),
    totalMinutes: sections.reduce((n, s) => n + s.minutes, 0),
  };
}
