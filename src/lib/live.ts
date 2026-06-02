import { prisma } from "@/lib/prisma";

// ── Live quiz (Kahoot-style, teacher-synchronized) ──────────────────────────
// DB is the source of truth; the SSE stream pushes computeLiveState() snapshots
// (verified to stream un-buffered on Zeabur). The teacher advances questions /
// reveals answers; students answer the CURRENT question only, before reveal.

const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function genJoinCode(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < len; i++) s += JOIN_ALPHABET[bytes[i] % JOIN_ALPHABET.length];
  return s;
}
async function uniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const c = genJoinCode();
    const exists = await prisma.liveSession.findUnique({ where: { joinCode: c }, select: { id: true } });
    if (!exists) return c;
  }
  return genJoinCode(8);
}

export interface LiveQuestion {
  q: string;
  pinyin?: string;
  options: string[];
  correct: number; // index into options
}

export const QUIZ_MAX_QUESTIONS = 20;
export type ControlAction = "start" | "reveal" | "next" | "end";

/** Validate teacher-supplied questions; returns the cleaned list or null. */
export function validateQuestions(input: unknown): LiveQuestion[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > QUIZ_MAX_QUESTIONS) return null;
  const out: LiveQuestion[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const q = String(r.q ?? "").trim();
    if (!q || !Array.isArray(r.options)) return null;
    const opts = (r.options as unknown[]).map((o) => String(o ?? "").trim());
    if (opts.length < 2 || opts.length > 6 || opts.some((o) => !o)) return null;
    const correct = r.correct;
    if (typeof correct !== "number" || !Number.isInteger(correct) || correct < 0 || correct >= opts.length) return null;
    const pinyin = r.pinyin ? String(r.pinyin).trim().slice(0, 300) : undefined;
    out.push({ q: q.slice(0, 300), pinyin, options: opts.map((o) => o.slice(0, 200)), correct });
  }
  return out;
}

export async function createLiveSession(
  classId: string,
  teacherId: string,
  title: string | null,
  questions: LiveQuestion[],
) {
  const owned = await prisma.class.findFirst({ where: { id: classId, teacherId }, select: { id: true } });
  if (!owned) return null;
  const joinCode = await uniqueJoinCode();
  return prisma.liveSession.create({
    data: { classId, teacherId, joinCode, title, questions: JSON.stringify(questions) },
    select: { id: true, joinCode: true },
  });
}

/** Enroll a student into a session by its join code (must be a member of the class). */
export async function joinByCode(joinCode: string, studentId: string, name: string) {
  const session = await prisma.liveSession.findUnique({
    where: { joinCode },
    select: { id: true, status: true, currentQIdx: true, classId: true },
  });
  if (!session || session.status === "ended") return { error: "not_found" as const };
  const member = await prisma.classMember.findUnique({
    where: { classId_studentId: { classId: session.classId, studentId } },
    select: { id: true },
  });
  if (!member) return { error: "not_enrolled" as const };
  await prisma.liveParticipant.upsert({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
    create: { sessionId: session.id, studentId, name: (name || "Student").slice(0, 40), joinQIdx: session.currentQIdx },
    update: {},
  });
  return { sessionId: session.id };
}

export async function controlSession(sessionId: string, teacherId: string, action: ControlAction) {
  const s = await prisma.liveSession.findFirst({
    where: { id: sessionId, teacherId },
    select: { id: true, currentQIdx: true, questions: true },
  });
  if (!s) return null;
  const total = (JSON.parse(s.questions) as LiveQuestion[]).length;
  if (action === "start") {
    await prisma.liveSession.update({ where: { id: sessionId }, data: { status: "running", currentQIdx: 0, revealed: false } });
  } else if (action === "reveal") {
    await prisma.liveSession.update({ where: { id: sessionId }, data: { revealed: true } });
  } else if (action === "next") {
    const next = s.currentQIdx + 1;
    if (next >= total) {
      await prisma.liveSession.update({ where: { id: sessionId }, data: { status: "ended", revealed: true, endedAt: new Date() } });
    } else {
      await prisma.liveSession.update({ where: { id: sessionId }, data: { currentQIdx: next, revealed: false } });
    }
  } else {
    await prisma.liveSession.update({ where: { id: sessionId }, data: { status: "ended", endedAt: new Date() } });
  }
  return { ok: true };
}

export async function submitAnswer(sessionId: string, studentId: string, questionIdx: number, answer: number) {
  const s = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { status: true, currentQIdx: true, revealed: true, questions: true },
  });
  if (!s) return { error: "not_found" as const };
  if (s.status !== "running") return { error: "not_running" as const };
  if (questionIdx !== s.currentQIdx) return { error: "wrong_question" as const };
  if (s.revealed) return { error: "locked" as const };
  const p = await prisma.liveParticipant.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
    select: { id: true },
  });
  if (!p) return { error: "not_participant" as const };
  const q = (JSON.parse(s.questions) as LiveQuestion[])[questionIdx];
  if (!q || answer < 0 || answer >= q.options.length) return { error: "bad_answer" as const };
  const correct = answer === q.correct;
  await prisma.liveAnswer.upsert({
    where: { sessionId_studentId_questionIdx: { sessionId, studentId, questionIdx } },
    create: { sessionId, studentId, questionIdx, answer: String(answer), correct },
    update: { answer: String(answer), correct, submittedAt: new Date() },
  });
  return { ok: true };
}

export interface LiveState {
  status: string;
  currentQIdx: number;
  totalQuestions: number;
  revealed: boolean;
  participantCount: number;
  question: { q: string; pinyin?: string; options: string[] } | null;
  correct: number | null;
  isTeacher: boolean;
  joinCode: string | null; // teacher only
  title: string | null;
  tally: number[] | null; // teacher only (or after reveal)
  answeredCount: number | null; // teacher only
  myAnswer: number | null; // student only
  myCorrect: boolean | null; // student only, after reveal
  leaderboard: { name: string; correct: number }[] | null; // when ended
}

/** Build a viewer-tailored snapshot, or null if the viewer may not see this session. */
export async function computeLiveState(sessionId: string, viewerId: string): Promise<LiveState | null> {
  const s = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      teacherId: true, status: true, currentQIdx: true, revealed: true,
      questions: true, joinCode: true, title: true,
    },
  });
  if (!s) return null;
  const isTeacher = s.teacherId === viewerId;
  if (!isTeacher) {
    const p = await prisma.liveParticipant.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: viewerId } },
      select: { id: true },
    });
    if (!p) return null; // only the teacher or a joined participant may view
  }

  const questions = JSON.parse(s.questions) as LiveQuestion[];
  const total = questions.length;
  const idx = s.currentQIdx;
  const cur = s.status === "running" && idx < total ? questions[idx] : null;
  const participantCount = await prisma.liveParticipant.count({ where: { sessionId } });

  let tally: number[] | null = null;
  let answeredCount: number | null = null;
  let myAnswer: number | null = null;
  let myCorrect: boolean | null = null;

  if (cur) {
    if (isTeacher) {
      const ans = await prisma.liveAnswer.findMany({ where: { sessionId, questionIdx: idx }, select: { answer: true } });
      tally = new Array(cur.options.length).fill(0);
      for (const a of ans) {
        const i = parseInt(a.answer, 10);
        if (i >= 0 && i < tally.length) tally[i] += 1;
      }
      answeredCount = ans.length;
    } else {
      const mine = await prisma.liveAnswer.findUnique({
        where: { sessionId_studentId_questionIdx: { sessionId, studentId: viewerId, questionIdx: idx } },
        select: { answer: true, correct: true },
      });
      if (mine) {
        myAnswer = parseInt(mine.answer, 10);
        myCorrect = s.revealed ? mine.correct : null;
      }
    }
  }

  let leaderboard: { name: string; correct: number }[] | null = null;
  if (s.status === "ended") {
    const [parts, byStudent] = await Promise.all([
      prisma.liveParticipant.findMany({ where: { sessionId }, select: { studentId: true, name: true } }),
      prisma.liveAnswer.groupBy({ by: ["studentId"], where: { sessionId, correct: true }, _count: { _all: true } }),
    ]);
    const map = new Map(byStudent.map((g) => [g.studentId, g._count._all]));
    leaderboard = parts
      .map((p) => ({ name: p.name, correct: map.get(p.studentId) ?? 0 }))
      .sort((a, b) => b.correct - a.correct)
      .slice(0, 50);
  }

  return {
    status: s.status,
    currentQIdx: idx,
    totalQuestions: total,
    revealed: s.revealed,
    participantCount,
    question: cur ? { q: cur.q, pinyin: cur.pinyin, options: cur.options } : null,
    correct: s.revealed && cur ? cur.correct : null,
    isTeacher,
    joinCode: isTeacher ? s.joinCode : null,
    title: s.title,
    tally: isTeacher ? tally : s.revealed ? tally : null,
    answeredCount: isTeacher ? answeredCount : null,
    myAnswer,
    myCorrect,
    leaderboard,
  };
}
