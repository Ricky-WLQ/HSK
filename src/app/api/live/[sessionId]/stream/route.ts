import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { computeLiveState } from "@/lib/live";

// SSE: pushes a fresh computeLiveState() snapshot whenever it changes (DB is the
// source of truth). Verified to stream un-buffered on Zeabur with these headers.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  const { sessionId } = await params;
  const viewerId = session.user.id;

  const initial = await computeLiveState(sessionId, viewerId);
  if (!initial) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send(initial);
      let lastHash = JSON.stringify(initial);
      let ticks = 0;

      while (!closed) {
        await new Promise((r) => setTimeout(r, 1000));
        if (closed) break;
        ticks += 1;

        let state: Awaited<ReturnType<typeof computeLiveState>>;
        try {
          state = await computeLiveState(sessionId, viewerId);
        } catch {
          continue; // transient DB hiccup — keep the connection alive
        }
        if (!state) break; // session vanished / access revoked

        const h = JSON.stringify(state);
        if (h !== lastHash) {
          lastHash = h;
          send(state);
        } else if (ticks % 15 === 0) {
          controller.enqueue(encoder.encode(`: ping\n\n`)); // heartbeat keeps proxies open
        }

        if (state.status === "ended") break;
      }

      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
