import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// GET /api/vocab/progress?level=1  -> { progress: { [wordId]: mastery } }
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ progress: {} });
  const level = req.nextUrl.searchParams.get("level") ?? undefined;
  const rows = await prisma.vocabProgress.findMany({
    where: { userId: session.user.id, ...(level ? { level } : {}) },
    select: { wordId: true, mastery: true },
  });
  const progress: Record<string, number> = {};
  for (const r of rows) progress[r.wordId] = r.mastery;
  return NextResponse.json({ progress });
}

// POST /api/vocab/progress  body: { wordId, level, hanzi, correct }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { wordId?: string; level?: string; hanzi?: string; correct?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { wordId, level, hanzi, correct } = body;
  if (!wordId || !level || typeof correct !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const userId = session.user.id;
  const existing = await prisma.vocabProgress.findUnique({
    where: { userId_wordId: { userId, wordId } },
  });
  const delta = correct ? 1 : -1;
  const newMastery = Math.max(0, Math.min(5, (existing?.mastery ?? 0) + delta));

  const row = await prisma.vocabProgress.upsert({
    where: { userId_wordId: { userId, wordId } },
    create: {
      userId,
      wordId,
      level,
      hanzi: hanzi ?? "",
      mastery: Math.max(0, delta),
      reviewCount: 1,
      correctCount: correct ? 1 : 0,
      lastReviewed: new Date(),
    },
    update: {
      mastery: newMastery,
      reviewCount: { increment: 1 },
      correctCount: { increment: correct ? 1 : 0 },
      lastReviewed: new Date(),
      level,
    },
  });

  return NextResponse.json({ mastery: row.mastery });
}
