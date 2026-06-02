import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cancelBooking } from "@/lib/scheduling";

// Student cancels their own booking for a session.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  await cancelBooking(sessionId, session.user.id);
  return NextResponse.json({ ok: true });
}
