"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, RotateCcw } from "lucide-react";
import { t } from "@/i18n";
import type { MistakeItem } from "@/lib/progress";

const sectionLabel = (s: string) => (t.progress.sections as Record<string, string>)[s] ?? s;
const statusLabel = (s: string) =>
  s === "mastered" ? t.mistakes.statusMastered : s === "reviewed" ? t.mistakes.statusReviewed : t.mistakes.statusNew;

type Filter = "all" | "new" | "reviewed" | "mastered";

export default function MistakeList({ mistakes }: { mistakes: MistakeItem[] }) {
  const [items, setItems] = useState(mistakes);
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? items : items.filter((m) => m.status === filter);

  async function setStatus(id: string, status: string) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    try {
      await fetch("/api/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      /* optimistic; best-effort */
    }
  }

  const counts: Record<Filter, number> = {
    all: items.length,
    new: items.filter((m) => m.status === "new").length,
    reviewed: items.filter((m) => m.status === "reviewed").length,
    mastered: items.filter((m) => m.status === "mastered").length,
  };
  const filterLabel = (f: Filter) =>
    f === "all" ? t.mistakes.all : f === "new" ? t.mistakes.statusNew : f === "reviewed" ? t.mistakes.statusReviewed : t.mistakes.statusMastered;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "new", "reviewed", "mastered"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`chip ${filter === f ? "chip-active" : ""}`}
          >
            {filterLabel(f)} ({counts[f]})
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {shown.map((m) => {
          const statusCls =
            m.status === "mastered" ? "badge-secondary" : m.status === "reviewed" ? "badge-info" : "badge-primary";
          return (
            <div key={m.id} className="card-elevated p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground/70">
                  HSK {m.level} · {sectionLabel(m.section)}
                </span>
                <span className={`badge ${statusCls}`}>{statusLabel(m.status)}</span>
              </div>

              {m.questionContext && (
                <div className="mb-2 rounded-xl bg-surface p-3 text-sm leading-relaxed">{m.questionContext}</div>
              )}
              <div className="font-semibold leading-relaxed">{m.questionText}</div>

              {m.options && m.options.length > 0 && (
                <div className="mt-2 grid gap-1.5">
                  {m.options.map((o) => {
                    const isCorrect = o.label === m.correctAnswer;
                    const isYours = o.label === m.userAnswer;
                    const cls = isCorrect
                      ? "border-success bg-success/10"
                      : isYours
                        ? "border-error bg-error/10"
                        : "border-card-border";
                    return (
                      <div key={o.label} className={`flex items-start gap-2 rounded-lg border-2 p-2 text-sm ${cls}`}>
                        <span className="font-bold text-primary">{o.label}</span>
                        <span>{o.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 text-sm">
                <span className="text-error">
                  {t.mistakes.yourAnswer}: {m.userAnswer}
                </span>
                <span className="ml-3 text-success">
                  {t.mistakes.correctAnswer}: {m.correctAnswer}
                </span>
              </div>

              {m.analysis && (m.analysis.summary || m.analysis.analysis) && (
                <div className="mt-2 rounded-xl bg-surface p-3 text-sm">
                  {m.analysis.summary && <div className="font-semibold">{m.analysis.summary}</div>}
                  {m.analysis.analysis && <div className="mt-1 text-foreground/70">{m.analysis.analysis}</div>}
                  {(m.analysis.relatedVocab?.length ?? 0) > 0 && (
                    <div className="mt-1 text-xs text-primary">
                      {t.mistakes.relatedVocab}: {m.analysis.relatedVocab.join("、")}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {m.status !== "reviewed" && m.status !== "mastered" && (
                  <button onClick={() => setStatus(m.id, "reviewed")} className="btn-ghost text-sm">
                    {t.mistakes.markReviewed}
                  </button>
                )}
                {m.status !== "mastered" && (
                  <button onClick={() => setStatus(m.id, "mastered")} className="btn-ghost flex items-center gap-1 text-sm">
                    <Check className="h-3.5 w-3.5" /> {t.mistakes.markMastered}
                  </button>
                )}
                <Link
                  href={`/practice/${m.level}/${m.section}/${m.contentId}`}
                  className="btn-ghost flex items-center gap-1 text-sm"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t.mistakes.retry}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
