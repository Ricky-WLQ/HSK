import { prisma } from "@/lib/prisma";

// ── Scheduling & booking (Phase 4a, provider-agnostic) ──────────────────────
// Teacher schedules a ClassSession (capacity-bounded); enrolled students book a
// seat. Booking capacity is enforced inside a Serializable transaction so two
// students can't claim the same last seat. Cancelling a booking deletes the row.

export const MAX_DURATION_MIN = 120;
export const SESSION_TITLE_MAX = 80;

export async function createSession(opts: {
  classId: string;
  teacherId: string;
  title: string | null;
  startAt: Date;
  durationMin: number;
  maxParticipants: number;
  recordingRequested: boolean;
}): Promise<string | null> {
  const owned = await prisma.class.findFirst({
    where: { id: opts.classId, teacherId: opts.teacherId },
    select: { id: true },
  });
  if (!owned) return null;
  const durationMin = Math.min(Math.max(15, Math.round(opts.durationMin)), MAX_DURATION_MIN);
  const endAt = new Date(opts.startAt.getTime() + durationMin * 60_000);
  const maxParticipants = Math.min(Math.max(1, Math.round(opts.maxParticipants)), 100);
  const s = await prisma.classSession.create({
    data: {
      classId: opts.classId,
      teacherId: opts.teacherId,
      title: opts.title,
      startAt: opts.startAt,
      durationMin,
      endAt,
      maxParticipants,
      recordingRequested: opts.recordingRequested,
    },
    select: { id: true },
  });
  return s.id;
}

export type SessionRow = {
  id: string;
  title: string | null;
  startAt: string;
  endAt: string;
  durationMin: number;
  maxParticipants: number;
  booked: number;
  status: string;
};

/** Teacher: a class's upcoming (non-canceled) sessions with booked counts. */
export async function getClassSessions(classId: string, teacherId: string): Promise<SessionRow[] | null> {
  const owned = await prisma.class.findFirst({ where: { id: classId, teacherId }, select: { id: true } });
  if (!owned) return null;
  const sessions = await prisma.classSession.findMany({
    where: { classId, status: { not: "canceled" } },
    orderBy: { startAt: "asc" },
    include: { _count: { select: { bookings: true } } },
  });
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    durationMin: s.durationMin,
    maxParticipants: s.maxParticipants,
    booked: s._count.bookings,
    status: s.status,
  }));
}

export type StudentSessionRow = SessionRow & { className: string; mine: boolean };

/** Student: upcoming sessions across joined classes, with their booking flag. */
export async function getStudentSessions(studentId: string): Promise<StudentSessionRow[]> {
  const memberships = await prisma.classMember.findMany({
    where: { studentId },
    select: { classId: true, class: { select: { name: true } } },
  });
  if (memberships.length === 0) return [];
  const names = new Map(memberships.map((m) => [m.classId, m.class.name]));
  const sessions = await prisma.classSession.findMany({
    where: { classId: { in: memberships.map((m) => m.classId) }, status: { not: "canceled" } },
    orderBy: { startAt: "asc" },
    include: {
      _count: { select: { bookings: true } },
      bookings: { where: { studentId }, select: { id: true } },
    },
  });
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    className: names.get(s.classId) ?? "",
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    durationMin: s.durationMin,
    maxParticipants: s.maxParticipants,
    booked: s._count.bookings,
    mine: s.bookings.length > 0,
    status: s.status,
  }));
}

export type BookResult = { ok: true } | { error: "not_found" | "not_enrolled" | "full" | "canceled" };

/** Atomically book a seat (capacity-enforced; idempotent for the same student). */
export async function bookSession(sessionId: string, studentId: string): Promise<BookResult> {
  return prisma.$transaction(
    async (tx): Promise<BookResult> => {
      const s = await tx.classSession.findUnique({
        where: { id: sessionId },
        select: { classId: true, maxParticipants: true, status: true },
      });
      if (!s) return { error: "not_found" };
      if (s.status === "canceled" || s.status === "ended") return { error: "canceled" };
      const member = await tx.classMember.findUnique({
        where: { classId_studentId: { classId: s.classId, studentId } },
        select: { id: true },
      });
      if (!member) return { error: "not_enrolled" };
      const existing = await tx.sessionBooking.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
        select: { id: true },
      });
      if (existing) return { ok: true }; // already booked
      const count = await tx.sessionBooking.count({ where: { sessionId } });
      if (count >= s.maxParticipants) return { error: "full" };
      await tx.sessionBooking.create({ data: { sessionId, studentId } });
      return { ok: true };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function cancelBooking(sessionId: string, studentId: string) {
  await prisma.sessionBooking.deleteMany({ where: { sessionId, studentId } });
  return { ok: true };
}

export async function cancelSession(sessionId: string, teacherId: string): Promise<boolean> {
  const res = await prisma.classSession.updateMany({
    where: { id: sessionId, teacherId },
    data: { status: "canceled" },
  });
  return res.count > 0;
}
