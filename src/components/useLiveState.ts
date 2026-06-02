"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveState } from "@/lib/live"; // type-only — no server code bundled

export type LiveConnection = {
  state: LiveState | null;
  /** True until the SSE stream opens or fails — show a "connecting…" placeholder. */
  connecting: boolean;
  /** True when the stream closed without ever delivering data (e.g. SSE 404 → not a participant). */
  notJoined: boolean;
};

// Subscribe to a live session's SSE stream (same-origin EventSource sends the auth cookie).
export function useLiveState(sessionId: string): LiveConnection {
  const [state, setState] = useState<LiveState | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [notJoined, setNotJoined] = useState(false);
  const gotMessage = useRef(false);

  useEffect(() => {
    // Reset for a new session id.
    setState(null);
    setConnecting(true);
    setNotJoined(false);
    gotMessage.current = false;

    let es: EventSource | null = new EventSource(`/api/live/${sessionId}/stream`);
    es.onmessage = (e) => {
      gotMessage.current = true;
      setConnecting(false);
      setNotJoined(false);
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
    es.onerror = () => {
      // A non-participant gets an SSE 404, which fails the connection permanently
      // (readyState CLOSED) before any message. A transient drop on an already-open
      // stream goes to CONNECTING and auto-reconnects — so only flag "not joined" when
      // the stream is closed for good and never delivered data.
      if (es && es.readyState === EventSource.CLOSED && !gotMessage.current) {
        setConnecting(false);
        setNotJoined(true);
      }
    };
    return () => {
      es?.close();
      es = null;
    };
  }, [sessionId]);

  return { state, connecting, notJoined };
}
