"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Check } from "lucide-react";
import { t } from "@/i18n";

export default function JoinClassForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4 || joining) return;
    setJoining(true);
    setError(null);
    setJoined(false);
    try {
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: trimmed }),
      });
      if (!res.ok) {
        setError(t.teacher.joinFailed);
        return;
      }
      setJoined(true);
      setCode("");
      router.refresh(); // reload the server-rendered class list
    } catch {
      setError(t.teacher.joinFailed);
    } finally {
      setJoining(false);
    }
  }

  return (
    <form onSubmit={handleJoin} className="card-elevated space-y-3 p-6">
      <h2 className="font-heading flex items-center gap-2 text-lg font-bold">
        <LogIn className="h-5 w-5 text-primary" /> {t.teacher.joinClass}
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="invite-code" className="sr-only">
          {t.teacher.inviteCode}
        </label>
        <input
          id="invite-code"
          className="input-clay font-mono uppercase tracking-[0.2em] sm:flex-1"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
            setJoined(false);
          }}
          placeholder={t.teacher.joinPlaceholder}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={joining || code.trim().length < 4}
          className="btn-solid btn-solid-primary shrink-0"
        >
          {joined ? <Check className="h-4 w-4" /> : null}
          {joining ? t.teacher.joining : joined ? t.teacher.joinedClass : t.teacher.join}
        </button>
      </div>
      {error && <p role="alert" className="badge badge-error w-full justify-center py-2">{error}</p>}
    </form>
  );
}
