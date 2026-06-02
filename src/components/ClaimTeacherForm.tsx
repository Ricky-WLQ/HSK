"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { t } from "@/i18n";

export default function ClaimTeacherForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (res.status === 503) {
        setError(t.teacher.claimUnavailable);
        return;
      }
      if (!res.ok) {
        setError(t.teacher.claimInvalid);
        return;
      }
      // Role updated in the DB; navigate to the portal and refresh server data.
      router.push("/teacher");
      router.refresh();
    } catch {
      setError(t.teacher.claimInvalid);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-elevated space-y-3 p-6">
      <h2 className="font-heading flex items-center gap-2 text-lg font-bold">
        <KeyRound className="h-5 w-5 text-primary" /> {t.teacher.becomeTitle}
      </h2>
      <p className="text-sm text-foreground/75">{t.teacher.becomeSubtitle}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="teacher-code" className="sr-only">
          {t.teacher.accessCode}
        </label>
        <input
          id="teacher-code"
          className="input-clay sm:flex-1"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder={t.teacher.accessCodePlaceholder}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="btn-solid btn-solid-primary shrink-0"
        >
          {loading ? t.teacher.claiming : t.teacher.claim}
        </button>
      </div>
      {error && <p className="badge badge-error w-full justify-center py-2">{error}</p>}
    </form>
  );
}
