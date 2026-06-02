"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { t } from "@/i18n";

export default function BookButton({ sessionId, mine, full }: { sessionId: string; mine: boolean; full: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function act() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const url = mine ? `/api/sessions/${sessionId}/cancel-booking` : `/api/sessions/${sessionId}/book`;
      const res = await fetch(url, { method: "POST" });
      if (res.ok) router.refresh();
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (full && !mine) {
    return <span className="badge badge-warning shrink-0">{t.schedule.full}</span>;
  }

  const btn = mine ? (
    <button type="button" onClick={act} disabled={busy} className="btn-solid btn-solid-outline shrink-0">
      <Check className="h-4 w-4 text-success" /> {busy ? t.schedule.cancelling : t.schedule.cancelBooking}
    </button>
  ) : (
    <button type="button" onClick={act} disabled={busy} className="btn-solid btn-solid-primary shrink-0">
      {busy ? t.schedule.booking : t.schedule.book}
    </button>
  );

  if (!error) return btn;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {btn}
      <span role="alert" className="text-xs font-semibold text-error">
        {t.schedule.actionError}
      </span>
    </div>
  );
}
