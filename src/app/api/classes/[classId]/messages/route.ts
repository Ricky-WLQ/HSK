import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";
import { getClassRole, getThread, postMessage, markThreadRead, MESSAGE_MAX } from "@/lib/messages";

// GET a thread: ?studentId=<id> for a 1:1 thread, or no param for class-wide announcements.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { classId } = await params;

  const role = await getClassRole(classId, session.user.id);
  if (!role.isTeacher && !role.isStudent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (studentId) {
    // 1:1 thread — only the class teacher or that exact student may view it.
    if (!role.isTeacher && session.user.id !== studentId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const messages = await getThread(classId, studentId, session.user.id);
    await markThreadRead(classId, studentId, session.user.id);
    return NextResponse.json({ messages });
  }

  // Class-wide announcements — any member or the teacher.
  const messages = await getThread(classId, null, session.user.id);
  return NextResponse.json({ messages });
}

// POST a message: { body, studentId? }. studentId null/absent = announcement (teacher only).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { classId } = await params;
  if (rateLimited(`msg:${session.user.id}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const role = await getClassRole(classId, session.user.id);
  if (!role.isTeacher && !role.isStudent) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: { body?: string; studentId?: string };
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const text = String(raw.body ?? "").trim().slice(0, MESSAGE_MAX);
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  const studentId = raw.studentId ? String(raw.studentId) : null;

  if (studentId === null) {
    // Announcement — teacher only.
    if (!role.isTeacher) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else if (role.isTeacher) {
    // Teacher → a student: that student must be enrolled in this class.
    const member = await prisma.classMember.findUnique({
      where: { classId_studentId: { classId, studentId } },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: "not a member" }, { status: 404 });
  } else if (session.user.id !== studentId) {
    // Student → may only post in their OWN thread.
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await postMessage(classId, session.user.id, studentId, text);
  return NextResponse.json({ ok: true });
}
