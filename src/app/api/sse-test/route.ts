// TEMPORARY SSE feasibility probe for Zeabur. Public (no auth) so it can be
// curled. Emits 8 events 500ms apart; if Zeabur's proxy streams them
// incrementally (un-buffered) SSE is viable for the live-quiz. REMOVE after testing.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n")); // flush headers immediately
      for (let i = 0; i < 8; i++) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ i })}\n\n`));
        await new Promise((r) => setTimeout(r, 500));
      }
      controller.enqueue(encoder.encode("event: done\ndata: end\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
