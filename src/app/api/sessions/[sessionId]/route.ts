import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cancelSession } from "@/lib/scheduling";

// Cancel a scheduled session the teacher owns.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  const ok = await cancelSession(sessionId, session.user.id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
