import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimited } from "@/lib/rate-limit";
import {
  ASSIGNMENT_TYPES,
  type AssignmentType,
  buildTarget,
  createAssignment,
  ASSIGNMENT_TITLE_MAX,
  ASSIGNMENT_DESC_MAX,
} from "@/lib/assignments";
import { levelLabel } from "@/lib/levels";

const DEFAULT_TITLE: Record<AssignmentType, string> = {
  practice: "practice",
  grammar: "grammar drills",
  mock: "mock exam",
  diagnostic: "diagnostic test",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "teacher" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (rateLimited(`assignment-create:${session.user.id}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: {
    classId?: string;
    type?: string;
    level?: string;
    section?: string;
    setId?: string;
    title?: string;
    description?: string;
    dueDate?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const classId = String(body.classId ?? "");
  const type = body.type as AssignmentType;
  if (!classId || !(ASSIGNMENT_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const target = buildTarget(type, String(body.level ?? ""), body.section, body.setId);
  if (!target) return NextResponse.json({ error: "invalid target" }, { status: 400 });

  let dueDate: Date | null = null;
  if (body.dueDate) {
    const d = new Date(body.dueDate);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "invalid dueDate" }, { status: 400 });
    dueDate = d;
  }

  const title =
    String(body.title ?? "").trim().slice(0, ASSIGNMENT_TITLE_MAX) ||
    `${levelLabel(target.level)} ${type === "practice" ? `${target.section} practice` : DEFAULT_TITLE[type]}`;
  const description = body.description ? String(body.description).trim().slice(0, ASSIGNMENT_DESC_MAX) : null;

  const id = await createAssignment({
    classId,
    teacherId: session.user.id,
    type,
    target,
    title,
    description,
    dueDate,
  });
  if (!id) return NextResponse.json({ error: "class not found" }, { status: 404 });
  return NextResponse.json({ ok: true, assignmentId: id });
}
