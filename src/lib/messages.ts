import { prisma } from "@/lib/prisma";

// ── Class messaging (ClassComment) ──────────────────────────────────────────
// Two kinds of thread, distinguished by studentId:
//   • studentId = null  → class-wide ANNOUNCEMENT channel (teacher posts; everyone reads)
//   • studentId = <id>  → 1:1 thread between the teacher and that student (both post/read)
// isRead is meaningful only for 1:1 threads (announcements are broadcast → no per-student
// read receipt in this schema). Access is always enforced server-side.

export const MESSAGE_MAX = 2000;

export type ClassRole = { isTeacher: boolean; isStudent: boolean; teacherId: string | null };

/** The viewer's relationship to a class. */
export async function getClassRole(classId: string, userId: string): Promise<ClassRole> {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } });
  if (!cls) return { isTeacher: false, isStudent: false, teacherId: null };
  if (cls.teacherId === userId) return { isTeacher: true, isStudent: false, teacherId: cls.teacherId };
  const m = await prisma.classMember.findUnique({
    where: { classId_studentId: { classId, studentId: userId } },
    select: { id: true },
  });
  return { isTeacher: false, isStudent: !!m, teacherId: cls.teacherId };
}

export interface MessageView {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  mine: boolean;
  createdAt: string; // ISO
}

export async function getThread(
  classId: string,
  studentId: string | null,
  viewerId: string,
): Promise<MessageView[]> {
  const rows = await prisma.classComment.findMany({
    where: { classId, studentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, authorId: true, createdAt: true, author: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    authorId: r.authorId,
    authorName: r.author.name,
    mine: r.authorId === viewerId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function postMessage(
  classId: string,
  authorId: string,
  studentId: string | null,
  body: string,
) {
  return prisma.classComment.create({
    data: { classId, authorId, studentId, body: body.slice(0, MESSAGE_MAX) },
    select: { id: true },
  });
}

/** Mark the other party's messages in a 1:1 thread as read for this viewer. */
export async function markThreadRead(classId: string, studentId: string, viewerId: string) {
  await prisma.classComment.updateMany({
    where: { classId, studentId, authorId: { not: viewerId }, isRead: false },
    data: { isRead: true },
  });
}

/** Unread teacher→student messages for one student in one class. */
export async function studentUnread(classId: string, studentId: string): Promise<number> {
  return prisma.classComment.count({
    where: { classId, studentId, authorId: { not: studentId }, isRead: false },
  });
}

/** Unread student→teacher messages across a whole class. */
export async function teacherUnread(classId: string, teacherId: string): Promise<number> {
  return prisma.classComment.count({
    where: { classId, studentId: { not: null }, authorId: { not: teacherId }, isRead: false },
  });
}

/** Per-student unread counts (student-authored, unread) for the teacher's thread list. */
export async function teacherThreadUnread(
  classId: string,
  teacherId: string,
): Promise<Record<string, number>> {
  const grouped = await prisma.classComment.groupBy({
    by: ["studentId"],
    where: { classId, studentId: { not: null }, authorId: { not: teacherId }, isRead: false },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) if (g.studentId) out[g.studentId] = g._count._all;
  return out;
}
