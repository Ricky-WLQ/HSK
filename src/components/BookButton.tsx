"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { t } from "@/i18n";

export default function BookButton({ sessionId, mine, full }: { sessionId: string; mine: boolean; full: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act() {
    if (busy) return;
    setBusy(true);
    try {
      const url = mine ? `/api/sessions/${sessionId}/cancel-booking` : `/api/sessions/${sessionId}/book`;
      const res = await fetch(url, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (mine) {
    return (
      <button type="button" onClick={act} disabled={busy} className="btn-solid btn-solid-outline shrink-0">
        <Check className="h-4 w-4 text-success" /> {t.schedule.cancelBooking}
      </button>
    );
  }
  if (full) {
    return <span className="badge badge-warning shrink-0">{t.schedule.full}</span>;
  }
  return (
    <button type="button" onClick={act} disabled={busy} className="btn-solid btn-solid-primary shrink-0">
      {busy ? t.schedule.booking : t.schedule.book}
    </button>
  );
}
