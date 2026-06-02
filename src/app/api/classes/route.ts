import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";
import { createUniqueInviteCode, CLASS_NAME_MAX, CLASS_DESC_MAX } from "@/lib/classes";

// Create a class (teacher/admin only).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "teacher" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (rateLimited(`class-create:${session.user.id}`, 10)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { name?: string; description?: string; level?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, CLASS_NAME_MAX);
  const description = body.description ? String(body.description).trim().slice(0, CLASS_DESC_MAX) : null;
  const level = body.level && /^([1-6]|7-9)$/.test(String(body.level)) ? String(body.level) : null;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const inviteCode = await createUniqueInviteCode();
    const cls = await prisma.class.create({
      data: { name, description, level, teacherId: session.user.id, inviteCode },
      select: { id: true, inviteCode: true },
    });
    return NextResponse.json({ ok: true, classId: cls.id, inviteCode: cls.inviteCode });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}
