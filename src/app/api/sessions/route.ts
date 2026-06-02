import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { createSession, SESSION_TITLE_MAX } from "@/lib/scheduling";

// Schedule a class session (teacher/admin, must own the class).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "teacher" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (rateLimited(`session-create:${session.user.id}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: {
    classId?: string;
    title?: string;
    startAt?: string;
    durationMin?: unknown;
    maxParticipants?: unknown;
    recordingRequested?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const classId = String(body.classId ?? "");
  const startAt = body.startAt ? new Date(String(body.startAt)) : null;
  if (!classId || !startAt || Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const durationMin = typeof body.durationMin === "number" ? body.durationMin : 60;
  const maxParticipants = typeof body.maxParticipants === "number" ? body.maxParticipants : 1;
  const title = body.title ? String(body.title).trim().slice(0, SESSION_TITLE_MAX) : null;

  const id = await createSession({
    classId,
    teacherId: session.user.id,
    title,
    startAt,
    durationMin,
    maxParticipants,
    recordingRequested: !!body.recordingRequested,
  });
  if (!id) return NextResponse.json({ error: "class not found" }, { status: 404 });
  return NextResponse.json({ ok: true, sessionId: id });
}
