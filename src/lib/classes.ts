import { prisma } from "@/lib/prisma";

// Human-friendly, unambiguous alphabet (no 0/O/1/I/L) for invite codes.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function genInviteCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

/** A code guaranteed unique against existing classes (retries on the rare clash). */
export async function createUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = genInviteCode();
    const exists = await prisma.class.findUnique({ where: { inviteCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return genInviteCode(10);
}

export async function getTeacherClasses(teacherId: string) {
  return prisma.class.findMany({
    where: { teacherId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true, assignments: true } } },
  });
}

/** A class only if owned by this teacher (ownership scoping); null otherwise. */
export async function getOwnedClass(classId: string, teacherId: string) {
  return prisma.class.findFirst({ where: { id: classId, teacherId } });
}

export async function getClassWithRoster(classId: string, teacherId: string) {
  return prisma.class.findFirst({
    where: { id: classId, teacherId },
    include: {
      members: {
        orderBy: { joinedAt: "asc" },
        include: { student: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { assignments: true } },
    },
  });
}

export async function getStudentClasses(studentId: string) {
  const memberships = await prisma.classMember.findMany({
    where: { studentId },
    orderBy: { joinedAt: "desc" },
    include: { class: { include: { teacher: { select: { name: true } }, _count: { select: { members: true } } } } },
  });
  return memberships.map((m) => m.class);
}

export async function isEnrolled(studentId: string, classId: string): Promise<boolean> {
  const m = await prisma.classMember.findUnique({
    where: { classId_studentId: { classId, studentId } },
    select: { id: true },
  });
  return !!m;
}

export const CLASS_NAME_MAX = 60;
export const CLASS_DESC_MAX = 280;
