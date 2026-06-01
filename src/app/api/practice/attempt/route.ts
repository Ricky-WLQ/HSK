import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";

const LEVELS = new Set(["1", "2", "3", "4", "5", "6", "7-9"]);
const SECTIONS = new Set(["listening", "reading", "writing", "translation", "speaking", "grammar", "mock", "diagnostic"]);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(`hsk-attempt:${session.user.id}`, 60)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: {
    level?: string;
    section?: string;
    contentId?: string;
    totalQuestions?: number;
    correctCount?: number;
    answers?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { level, section, contentId, totalQuestions, correctCount, answers } = body;
  if (
    typeof level !== "string" || !LEVELS.has(level) ||
    typeof section !== "string" || !SECTIONS.has(section) ||
    typeof contentId !== "string" || !/^hsk[\w-]{2,40}$/.test(contentId) ||
    typeof totalQuestions !== "number" || totalQuestions < 0 || totalQuestions > 200 ||
    (correctCount !== undefined &&
      (typeof correctCount !== "number" || correctCount < 0 || correctCount > totalQuestions))
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    await prisma.hskAttempt.create({
      data: {
        userId: session.user.id,
        level,
        section,
        contentId,
        kind: "practice",
        status: "completed",
        totalQuestions,
        correctCount: typeof correctCount === "number" ? correctCount : null,
        answers: answers ? JSON.stringify(answers).slice(0, 20000) : null,
        completedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}
