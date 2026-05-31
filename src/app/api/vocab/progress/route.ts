import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const VALID_LEVELS = new Set(["1", "2", "3", "4", "5", "6", "7-9"]);
const WORD_ID = /^hsk(?:[1-6]|7-9)-\d{4}$/;

// Per-user write rate limit (bounds DB abuse; the maps are swept periodically).
const writes = new Map<string, { count: number; reset: number }>();
function writeLimited(userId: string): boolean {
  const now = Date.now();
  const e = writes.get(userId);
  if (!e || now > e.reset) {
    writes.set(userId, { count: 1, reset: now + 60_000 });
    return false;
  }
  e.count += 1;
  return e.count > 120; // 120 writes / minute / user
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of writes) if (now > v.reset) writes.delete(k);
}, 5 * 60_000).unref?.();

// GET /api/vocab/progress?level=1  -> { progress: { [wordId]: mastery } }
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const level = req.nextUrl.searchParams.get("level") ?? undefined;
  if (level !== undefined && !VALID_LEVELS.has(level)) {
    return NextResponse.json({ error: "bad level" }, { status: 400 });
  }
  try {
    const rows = await prisma.vocabProgress.findMany({
      where: { userId: session.user.id, ...(level ? { level } : {}) },
      select: { wordId: true, mastery: true },
    });
    const progress: Record<string, number> = {};
    for (const r of rows) progress[r.wordId] = r.mastery;
    return NextResponse.json({ progress });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}

// POST /api/vocab/progress  body: { wordId, level, hanzi, correct }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (writeLimited(session.user.id)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: { wordId?: string; level?: string; hanzi?: string; correct?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { wordId, level, hanzi, correct } = body;
  if (
    typeof wordId !== "string" || !WORD_ID.test(wordId) ||
    typeof level !== "string" || !VALID_LEVELS.has(level) ||
    typeof correct !== "boolean" ||
    (hanzi !== undefined && (typeof hanzi !== "string" || hanzi.length > 20))
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const userId = session.user.id;
  const delta = correct ? 1 : -1;
  const correctInc = correct ? 1 : 0;
  const han = hanzi ?? "";

  // Single atomic upsert: ON CONFLICT clamps mastery to [0,5] in-DB, so concurrent
  // answers can't lose an increment (no read-modify-write race) and the first-write
  // race can't throw a unique-constraint error.
  try {
    const rows = await prisma.$queryRaw<{ mastery: number }[]>`
      INSERT INTO "VocabProgress"
        ("id","userId","wordId","level","hanzi","mastery","reviewCount","correctCount","lastReviewed","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text, ${userId}, ${wordId}, ${level}, ${han},
         GREATEST(0, LEAST(5, ${delta})), 1, ${correctInc}, now(), now(), now())
      ON CONFLICT ("userId","wordId") DO UPDATE SET
        mastery = GREATEST(0, LEAST(5, "VocabProgress".mastery + ${delta})),
        "reviewCount" = "VocabProgress"."reviewCount" + 1,
        "correctCount" = "VocabProgress"."correctCount" + ${correctInc},
        "lastReviewed" = now(),
        "level" = ${level},
        "updatedAt" = now()
      RETURNING mastery`;
    return NextResponse.json({ mastery: rows[0]?.mastery ?? 0 });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}
