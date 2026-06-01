import { prisma } from "@/lib/prisma";
import { HSK_LEVELS } from "@/lib/vocab";

// Skill sections feed weak-point analysis; mock/diagnostic are whole-exam history.
export const SKILL_SECTIONS = ["listening", "reading", "writing", "translation", "grammar"] as const;

export type SectionStat = {
  section: string;
  attempts: number;
  questions: number;
  correct: number;
  accuracy: number; // 0..1
};
export type LevelStat = SectionStat & { level: string };
export type AttemptRow = {
  id: string;
  level: string;
  section: string;
  contentId: string;
  totalQuestions: number;
  correctCount: number | null;
  completedAt: Date | null;
};
export type MistakeCounts = { new: number; reviewed: number; mastered: number; total: number };

export type ProgressSummary = {
  totalAttempts: number;
  totalQuestions: number;
  totalCorrect: number;
  overallAccuracy: number;
  bySection: SectionStat[];
  byLevel: LevelStat[];
  recent: AttemptRow[];
  examScores: AttemptRow[];
  vocabMastered: number;
  mistakes: MistakeCounts;
  weakest: SectionStat | null;
};

const ROW_SELECT = {
  id: true,
  level: true,
  section: true,
  contentId: true,
  totalQuestions: true,
  correctCount: true,
  completedAt: true,
} as const;

export async function getProgressSummary(userId: string): Promise<ProgressSummary> {
  const [overall, count, bySectionRaw, byLevelRaw, recent, examScores, vocabMastered, mistakeRaw] =
    await Promise.all([
      prisma.hskAttempt.aggregate({
        where: { userId, status: "completed" },
        _sum: { correctCount: true, totalQuestions: true },
      }),
      prisma.hskAttempt.count({ where: { userId, status: "completed" } }),
      prisma.hskAttempt.groupBy({
        by: ["section"],
        where: { userId, status: "completed" },
        _sum: { correctCount: true, totalQuestions: true },
        _count: { _all: true },
      }),
      prisma.hskAttempt.groupBy({
        by: ["level"],
        where: { userId, status: "completed" },
        _sum: { correctCount: true, totalQuestions: true },
        _count: { _all: true },
      }),
      prisma.hskAttempt.findMany({
        where: { userId, status: "completed" },
        orderBy: { completedAt: "desc" },
        take: 8,
        select: ROW_SELECT,
      }),
      prisma.hskAttempt.findMany({
        where: { userId, status: "completed", section: { in: ["mock", "diagnostic"] } },
        orderBy: { completedAt: "desc" },
        take: 8,
        select: ROW_SELECT,
      }),
      prisma.vocabProgress.count({ where: { userId, mastery: { gte: 4 } } }),
      prisma.hskMistake.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    ]);

  const acc = (correct: number, questions: number) => (questions > 0 ? correct / questions : 0);

  const bySection: SectionStat[] = (SKILL_SECTIONS as readonly string[])
    .map((sec) => {
      const r = bySectionRaw.find((x) => x.section === sec);
      const questions = r?._sum.totalQuestions ?? 0;
      const correct = r?._sum.correctCount ?? 0;
      return { section: sec, attempts: r?._count._all ?? 0, questions, correct, accuracy: acc(correct, questions) };
    })
    .filter((s) => s.attempts > 0);

  const byLevel: LevelStat[] = byLevelRaw
    .map((r) => {
      const questions = r._sum.totalQuestions ?? 0;
      const correct = r._sum.correctCount ?? 0;
      return {
        level: r.level,
        section: "",
        attempts: r._count._all,
        questions,
        correct,
        accuracy: acc(correct, questions),
      };
    })
    .sort((a, b) => HSK_LEVELS.indexOf(a.level as (typeof HSK_LEVELS)[number]) - HSK_LEVELS.indexOf(b.level as (typeof HSK_LEVELS)[number]));

  const mistakes: MistakeCounts = { new: 0, reviewed: 0, mastered: 0, total: 0 };
  for (const m of mistakeRaw) {
    const n = m._count._all;
    mistakes.total += n;
    if (m.status === "new") mistakes.new = n;
    else if (m.status === "reviewed") mistakes.reviewed = n;
    else if (m.status === "mastered") mistakes.mastered = n;
  }

  // Weakest skill section with enough data to be meaningful.
  const weakest =
    [...bySection].filter((s) => s.questions >= 5).sort((a, b) => a.accuracy - b.accuracy)[0] ?? null;

  const totalQuestions = overall._sum.totalQuestions ?? 0;
  const totalCorrect = overall._sum.correctCount ?? 0;
  return {
    totalAttempts: count,
    totalQuestions,
    totalCorrect,
    overallAccuracy: acc(totalCorrect, totalQuestions),
    bySection,
    byLevel,
    recent,
    examScores,
    vocabMastered,
    mistakes,
    weakest,
  };
}

export type MistakeItem = {
  id: string;
  level: string;
  section: string;
  contentId: string;
  questionId: string;
  questionText: string;
  questionContext: string | null;
  options: { label: string; text: string }[] | null;
  userAnswer: string;
  correctAnswer: string;
  analysis: { summary: string; analysis: string; relatedVocab: string[] } | null;
  status: string;
  createdAt: Date;
};

export async function getMistakes(
  userId: string,
  filters: { level?: string; section?: string; status?: string } = {},
): Promise<MistakeItem[]> {
  const rows = await prisma.hskMistake.findMany({
    where: {
      userId,
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.section ? { section: filters.section } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return rows.map((r) => ({
    id: r.id,
    level: r.level,
    section: r.section,
    contentId: r.contentId,
    questionId: r.questionId,
    questionText: r.questionText,
    questionContext: r.questionContext,
    options: safeParse<{ label: string; text: string }[]>(r.options),
    userAnswer: r.userAnswer,
    correctAnswer: r.correctAnswer,
    analysis: safeParse<{ summary: string; analysis: string; relatedVocab: string[] }>(r.analysis),
    status: r.status,
    createdAt: r.createdAt,
  }));
}

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
