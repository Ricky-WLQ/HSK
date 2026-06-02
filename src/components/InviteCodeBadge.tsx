"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { t } from "@/i18n";

/** Shows a class invite code with a copy-to-clipboard button (touch-friendly). */
export default function InviteCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return; // clipboard unavailable (e.g. insecure context) — code stays visible to copy by hand
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {t.teacher.inviteCode}
      </span>
      <code className="select-all rounded-lg border-2 border-card-border bg-surface px-2.5 py-1 font-mono text-base font-bold tracking-[0.2em]">
        {code}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t.teacher.copied : t.teacher.copy}
        className="btn-ghost flex h-10 items-center gap-1.5 px-3 text-sm"
      >
        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        {copied ? t.teacher.copied : t.teacher.copy}
      </button>
    </div>
  );
}
