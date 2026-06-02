import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import { bookSession } from "@/lib/scheduling";

// Student books a seat in a scheduled session (capacity-enforced).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  if (rateLimited(`book:${session.user.id}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let res;
  try {
    res = await bookSession(sessionId, session.user.id);
  } catch {
    // Serializable conflict (two students racing for the last seat) — retryable.
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }
  if ("error" in res) {
    const status = res.error === "not_enrolled" ? 403 : res.error === "full" ? 409 : 404;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
