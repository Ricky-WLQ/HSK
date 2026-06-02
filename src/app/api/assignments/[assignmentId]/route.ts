import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Delete an assignment the teacher owns (cascades its completions).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { assignmentId } = await params;

  try {
    const res = await prisma.assignment.deleteMany({
      where: { id: assignmentId, teacherId: session.user.id },
    });
    if (res.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "database error" }, { status: 500 });
  }
}
