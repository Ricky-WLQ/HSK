import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Mint a LiveKit access token for a scheduled session. Only the class teacher or a
// student with a booked seat may join; the secret signs the JWT server-side.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  if (rateLimited(`lk-token:${session.user.id}`, 30)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json({ error: "video not configured" }, { status: 503 });
  }

  const cs = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, teacherId: true, status: true, durationMin: true, videoRoom: true },
  });
  if (!cs) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (cs.status === "canceled") return NextResponse.json({ error: "canceled" }, { status: 403 });

  const isTeacher = cs.teacherId === session.user.id;
  let allowed = isTeacher;
  if (!allowed) {
    const booking = await prisma.sessionBooking.findUnique({
      where: { sessionId_studentId: { sessionId, studentId: session.user.id } },
      select: { id: true },
    });
    allowed = !!booking;
  }
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const room = cs.videoRoom ?? `hsk-session-${cs.id}`;
  if (!cs.videoRoom) {
    await prisma.classSession.update({ where: { id: cs.id }, data: { videoRoom: room } }).catch(() => {});
  }

  // Token outlives the class (duration + 1h buffer, min 2h) so it doesn't expire mid-session.
  const ttlSeconds = Math.max((cs.durationMin + 60) * 60, 7200);
  const at = new AccessToken(apiKey, apiSecret, {
    identity: session.user.id,
    name: session.user.name ?? "User",
    ttl: ttlSeconds,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const token = await at.toJwt();
  return NextResponse.json({ token, url, room });
}
