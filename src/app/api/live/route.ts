import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { createLiveSession, validateQuestions } from "@/lib/live";

// Create a live quiz session (teacher/admin, must own the class).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "teacher" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (rateLimited(`live-create:${session.user.id}`, 20)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { classId?: string; title?: string; questions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const classId = String(body.classId ?? "");
  const title = body.title ? String(body.title).trim().slice(0, 80) : null;
  const questions = validateQuestions(body.questions);
  if (!classId || !questions) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const s = await createLiveSession(classId, session.user.id, title, questions);
  if (!s) return NextResponse.json({ error: "class not found" }, { status: 404 });
  return NextResponse.json({ ok: true, sessionId: s.id, joinCode: s.joinCode });
}
