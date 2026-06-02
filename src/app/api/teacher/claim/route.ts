import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";

// Promote the signed-in user to "teacher" if they present the correct secret
// teacher-signup code (held only in the TEACHER_SIGNUP_CODE env var). Brute-force
// is bounded by (a) requiring a session, (b) a tight rate limit, and (c) a long
// random code — but the code must be a strong secret for this to be safe.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Tight limit: a few guesses per minute per account.
  if (rateLimited(`teacher-claim:${session.user.id}`, 5)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const expected = process.env.TEACHER_SIGNUP_CODE ?? "";
  if (expected.length < 8) {
    // Unset or too weak → feature is unavailable; never accept.
    return NextResponse.json({ error: "teacher signup is unavailable" }, { status: 503 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const code = String(body.code ?? "").trim();
  // Constant-time compare; timingSafeEqual needs equal-length buffers, so gate on length first.
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return NextResponse.json({ error: "invalid code" }, { status: 403 });

  // Never demote an existing teacher/admin.
  const current = session.user.role;
  if (current === "teacher" || current === "admin") {
    return NextResponse.json({ ok: true, role: current });
  }

  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { role: "teacher" } });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, role: "teacher" });
}
