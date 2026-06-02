import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { submitAnswer } from "@/lib/live";

// Student submits an answer to the CURRENT question (before reveal).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  if (rateLimited(`live-ans:${session.user.id}`, 120)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { questionIdx?: unknown; answer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (typeof body.questionIdx !== "number" || typeof body.answer !== "number") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const res = await submitAnswer(sessionId, session.user.id, body.questionIdx, body.answer);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.error === "not_participant" ? 403 : 409 });
  }
  return NextResponse.json({ ok: true });
}
