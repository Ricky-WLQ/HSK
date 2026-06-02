"use client";

import { useEffect, useState } from "react";
import type { LiveState } from "@/lib/live"; // type-only — no server code bundled

// Subscribe to a live session's SSE stream (same-origin EventSource sends the auth cookie).
export function useLiveState(sessionId: string): LiveState | null {
  const [state, setState] = useState<LiveState | null>(null);

  useEffect(() => {
    let es: EventSource | null = new EventSource(`/api/live/${sessionId}/stream`);
    es.onmessage = (e) => {
      try {
        const s = JSON.parse(e.data) as LiveState;
        setState(s);
        if (s.status === "ended") {
          es?.close();
          es = null; // don't auto-reconnect after the quiz ends
        }
      } catch {
        // ignore malformed frame
      }
    };
    return () => {
      es?.close();
      es = null;
    };
  }, [sessionId]);

  return state;
}
