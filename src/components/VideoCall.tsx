"use client";

import { useEffect, useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { t } from "@/i18n";

export default function VideoCall({ sessionId }: { sessionId: string }) {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/token`, { method: "POST" });
        if (!res.ok) {
          if (active) setError(res.status === 403 ? t.call.forbidden : t.call.failed);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { token?: string; url?: string };
        if (active && data.token && data.url) setConn({ token: data.token, url: data.url });
        else if (active) setError(t.call.failed);
      } catch {
        if (active) setError(t.call.failed);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (error) return <p className="card-flat px-5 py-10 text-center text-foreground/70">{error}</p>;
  if (!conn) return <p className="card-flat px-5 py-10 text-center text-foreground/75">{t.call.connecting}</p>;

  return (
    <div
      data-lk-theme="default"
      style={{ height: "76vh" }}
      className="overflow-hidden rounded-2xl border-2 border-card-border"
    >
      <LiveKitRoom token={conn.token} serverUrl={conn.url} connect audio video style={{ height: "100%" }}>
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
