import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";

const STATUSES = new Set(["new", "reviewed", "mastered"]);

// Update the review status of one of the caller's own mistakes.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(`hsk-mistake:${session.user.id}`, 60)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!id || id.length > 40 || !STATUSES.has(status)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    // Scope to userId so a user can only touch their own mistakes.
    const r = await prisma.hskMistake.updateMany({
      where: { id, userId: session.user.id },
      data: { status },
    });
    return NextResponse.json({ ok: r.count > 0 });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}
