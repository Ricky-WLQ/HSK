import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";

// Join a class via its invite code (any signed-in user).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(`class-join:${session.user.id}`, 8)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { inviteCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const code = String(body.inviteCode ?? "").trim().toUpperCase();
  if (code.length < 4 || code.length > 12) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

  try {
    const cls = await prisma.class.findUnique({
      where: { inviteCode: code },
      select: { id: true, name: true, isActive: true, teacherId: true },
    });
    if (!cls || !cls.isActive) return NextResponse.json({ error: "class not found" }, { status: 404 });
    if (cls.teacherId === session.user.id) {
      return NextResponse.json({ error: "you own this class" }, { status: 409 });
    }
    await prisma.classMember.upsert({
      where: { classId_studentId: { classId: cls.id, studentId: session.user.id } },
      create: { classId: cls.id, studentId: session.user.id },
      update: {},
    });
    return NextResponse.json({ ok: true, classId: cls.id, className: cls.name });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}
