import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { computeLiveState } from "@/lib/live";

export const dynamic = "force-dynamic";

// One-shot snapshot of the live state (viewer-tailored). Used for initial load + polling fallback.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  const state = await computeLiveState(sessionId, session.user.id);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(state);
}
