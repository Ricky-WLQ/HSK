import { prisma } from "@/lib/prisma";
import { CLASS_LEVELS } from "@/lib/levels";

// ── Teacher assignments / homework ──────────────────────────────────────────
// Mirrors the proven CET app: completion is computed IMPLICITLY by matching a
// student's finished HskAttempt to an assignment's target (level/section/setId)
// with completedAt >= the assignment's createdAt. No FK or query-param threading,
// so the practice/exam runners and the attempt API are untouched. HSK attempts are
// saved already-completed, so status is binary (completed) + computed overdue.

export const ASSIGNMENT_TYPES = ["practice", "grammar", "mock", "diagnostic"] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

// Practice sub-sections that have their own generated sets.
export const PRACTICE_SECTIONS = ["reading", "listening", "writing", "translation"] as const;
export type PracticeSection = (typeof PRACTICE_SECTIONS)[number];

const LEVELS = new Set<string>(CLASS_LEVELS);

export type AssignmentTarget = { level: string; section: string; setId?: string };

export type CompletionStatus = "not_started" | "completed" | "overdue";

export interface StudentCompletion {
  status: CompletionStatus;
  correctCount: number | null;
  totalQuestions: number | null;
  score: number | null; // percent (objective sections) or null
  completedAt: Date | null;
}

/** The section a non-practice type drills (deterministic single content per level). */
function sectionForType(type: AssignmentType, practiceSection?: string): string {
  if (type === "practice") return practiceSection ?? "";
  return type; // "grammar" | "mock" | "diagnostic" match HskAttempt.section
}

/** Validate + build a target from raw form input; returns null if invalid. */
export function buildTarget(
  type: AssignmentType,
  level: string,
  section?: string,
  setId?: string,
): AssignmentTarget | null {
  if (!LEVELS.has(level)) return null;
  if (type === "practice") {
    if (!section || !(PRACTICE_SECTIONS as readonly string[]).includes(section)) return null;
    if (!setId || !/^hsk[\w-]{2,40}$/.test(setId)) return null; // a specific generated set
    return { level, section, setId };
  }
  return { level, section: sectionForType(type) };
}

export function parseTarget(json: string): AssignmentTarget | null {
  try {
    const t = JSON.parse(json) as AssignmentTarget;
    if (!t || typeof t.level !== "string" || typeof t.section !== "string") return null;
    return t;
  } catch {
    return null;
  }
}

/** Deep link to the content a student must complete for this assignment. */
export function assignmentStartUrl(type: AssignmentType, t: AssignmentTarget): string {
  switch (type) {
    case "practice":
      return `/practice/${t.level}/${t.section}/${t.setId}`;
    case "grammar":
      return `/grammar/${t.level}`;
    case "mock":
      return `/exam/${t.level}`;
    case "diagnostic":
      return `/diagnostic/${t.level}`;
  }
}

/** Pick the best satisfying attempt per student and derive completion status. */
export async function computeCompletions(
  assignment: { type: string; target: string; createdAt: Date; dueDate: Date | null },
  studentIds: string[],
): Promise<Map<string, StudentCompletion>> {
  const result = new Map<string, StudentCompletion>();
  const now = new Date();
  const overdue = assignment.dueDate ? assignment.dueDate.getTime() < now.getTime() : false;
  const notDone: StudentCompletion = {
    status: overdue ? "overdue" : "not_started",
    correctCount: null,
    totalQuestions: null,
    score: null,
    completedAt: null,
  };
  for (const id of studentIds) result.set(id, notDone);

  const t = parseTarget(assignment.target);
  if (!t || studentIds.length === 0) return result;

  const attempts = await prisma.hskAttempt.findMany({
    where: {
      userId: { in: studentIds },
      status: "completed",
      level: t.level,
      section: t.section,
      ...(t.setId ? { contentId: t.setId } : {}),
      completedAt: { gte: assignment.createdAt },
    },
    select: { userId: true, correctCount: true, totalQuestions: true, completedAt: true },
    orderBy: { completedAt: "asc" },
  });

  // Best attempt per student: highest correctCount, tie-break latest.
  const best = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    const cur = best.get(a.userId);
    if (!cur || (a.correctCount ?? -1) >= (cur.correctCount ?? -1)) best.set(a.userId, a);
  }
  for (const [userId, a] of best) {
    const score =
      a.totalQuestions > 0 && a.correctCount != null
        ? Math.round((a.correctCount / a.totalQuestions) * 100)
        : null;
    result.set(userId, {
      status: "completed",
      correctCount: a.correctCount,
      totalQuestions: a.totalQuestions,
      score,
      completedAt: a.completedAt,
    });
  }
  return result;
}

/** Create an assignment in a class the teacher owns. Returns the new id, or null. */
export async function createAssignment(opts: {
  classId: string;
  teacherId: string;
  type: AssignmentType;
  target: AssignmentTarget;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
}): Promise<string | null> {
  const owned = await prisma.class.findFirst({
    where: { id: opts.classId, teacherId: opts.teacherId },
    select: { id: true },
  });
  if (!owned) return null;
  const a = await prisma.assignment.create({
    data: {
      classId: opts.classId,
      teacherId: opts.teacherId,
      type: opts.type,
      target: JSON.stringify(opts.target),
      title: opts.title,
      description: opts.description ?? null,
      dueDate: opts.dueDate ?? null,
    },
    select: { id: true },
  });
  return a.id;
}

/** Teacher view: active assignments for an owned class, each with X/Y completed. */
export async function getClassAssignmentsWithStats(classId: string, teacherId: string) {
  const owned = await prisma.class.findFirst({
    where: { id: classId, teacherId },
    select: { id: true, members: { select: { studentId: true } } },
  });
  if (!owned) return null;
  const memberIds = owned.members.map((m) => m.studentId);
  const assignments = await prisma.assignment.findMany({
    where: { classId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = [];
  for (const a of assignments) {
    const comps = await computeCompletions(a, memberIds);
    let completed = 0;
    for (const c of comps.values()) if (c.status === "completed") completed += 1;
    rows.push({
      id: a.id,
      type: a.type as AssignmentType,
      title: a.title,
      target: parseTarget(a.target),
      dueDate: a.dueDate,
      completed,
      total: memberIds.length,
    });
  }
  return rows;
}

/** Student view: their active assignments across joined classes + own status. */
export async function getStudentAssignments(studentId: string) {
  const memberships = await prisma.classMember.findMany({
    where: { studentId },
    select: { classId: true, class: { select: { name: true } } },
  });
  if (memberships.length === 0) return [];
  const classNames = new Map(memberships.map((m) => [m.classId, m.class.name]));
  const assignments = await prisma.assignment.findMany({
    where: { classId: { in: memberships.map((m) => m.classId) }, isActive: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  const out = [];
  for (const a of assignments) {
    const comp = (await computeCompletions(a, [studentId])).get(studentId)!;
    const target = parseTarget(a.target);
    out.push({
      id: a.id,
      type: a.type as AssignmentType,
      title: a.title,
      className: classNames.get(a.classId) ?? "",
      dueDate: a.dueDate,
      startUrl: target ? assignmentStartUrl(a.type as AssignmentType, target) : "#",
      status: comp.status,
      score: comp.score,
      correctCount: comp.correctCount,
      totalQuestions: comp.totalQuestions,
    });
  }
  return out;
}

/** Teacher monitoring: one assignment with each member's completion (ownership-scoped). */
export async function getAssignmentDetail(assignmentId: string, teacherId: string) {
  const a = await prisma.assignment.findFirst({
    where: { id: assignmentId, class: { teacherId } },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          members: {
            orderBy: { joinedAt: "asc" },
            select: {
              studentId: true,
              student: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!a) return null;

  const memberIds = a.class.members.map((m) => m.studentId);
  const comps = await computeCompletions(a, memberIds);
  const rows = a.class.members.map((m) => {
    const c = comps.get(m.studentId)!;
    return {
      studentId: m.studentId,
      name: m.student.name,
      email: m.student.email,
      status: c.status,
      score: c.score,
      correctCount: c.correctCount,
      totalQuestions: c.totalQuestions,
      completedAt: c.completedAt,
    };
  });
  const completed = rows.filter((r) => r.status === "completed").length;

  return {
    id: a.id,
    type: a.type as AssignmentType,
    title: a.title,
    description: a.description,
    target: parseTarget(a.target),
    dueDate: a.dueDate,
    classId: a.class.id,
    className: a.class.name,
    rows,
    completed,
    total: rows.length,
  };
}

export const ASSIGNMENT_TITLE_MAX = 80;
export const ASSIGNMENT_DESC_MAX = 280;
