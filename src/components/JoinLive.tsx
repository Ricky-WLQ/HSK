"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { t } from "@/i18n";

export default function JoinLive() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const joinCode = code.trim().toUpperCase();
    if (joinCode.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/live/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { sessionId?: string };
      if (!res.ok || !data.sessionId) {
        setError(t.live.joinFailed);
        return;
      }
      router.push(`/student/live/${data.sessionId}`);
    } catch {
      setError(t.live.joinFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-elevated space-y-3 p-6">
      <h2 className="font-heading flex items-center gap-2 text-lg font-bold">
        <Radio className="h-5 w-5 text-primary" /> {t.live.join}
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="live-code" className="sr-only">
          {t.live.enterCode}
        </label>
        <input
          id="live-code"
          className="input-clay font-mono uppercase tracking-[0.2em] sm:flex-1"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder={t.live.enterCode}
          maxLength={10}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || code.trim().length < 4} className="btn-solid btn-solid-primary shrink-0">
          {t.live.joinBtn}
        </button>
      </div>
      {error && <p className="badge badge-error w-full justify-center py-2">{error}</p>}
    </form>
  );
}
