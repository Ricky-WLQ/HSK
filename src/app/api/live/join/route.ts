import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { joinByCode } from "@/lib/live";

// Join a live session by its join code (must be a member of the class).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(`live-join:${session.user.id}`, 20)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { joinCode?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const joinCode = String(body.joinCode ?? "").trim().toUpperCase();
  if (joinCode.length < 4 || joinCode.length > 10) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }
  const name = body.name ? String(body.name) : session.user.name ?? "Student";

  const res = await joinByCode(joinCode, session.user.id, name);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.error === "not_enrolled" ? 403 : 404 });
  }
  return NextResponse.json({ ok: true, sessionId: res.sessionId });
}
