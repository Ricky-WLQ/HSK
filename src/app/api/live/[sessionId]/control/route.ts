import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { controlSession, type ControlAction } from "@/lib/live";

const ACTIONS = new Set<ControlAction>(["start", "reveal", "next", "end"]);

// Teacher advances the quiz: start | reveal | next | end.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  if (rateLimited(`live-ctl:${session.user.id}`, 120)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const action = body.action as ControlAction;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "bad action" }, { status: 400 });

  const res = await controlSession(sessionId, session.user.id, action);
  if (!res) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
