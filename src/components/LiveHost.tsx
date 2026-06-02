"use client";

import { useState } from "react";
import { Play, Eye, SkipForward, Square, Users, Trophy, CheckCircle2, Loader2 } from "lucide-react";
import { useLiveState } from "@/components/useLiveState";
import { t } from "@/i18n";

export default function LiveHost({ sessionId }: { sessionId: string }) {
  const { state } = useLiveState(sessionId);
  const [busy, setBusy] = useState(false);

  async function control(action: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/live/${sessionId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!state)
    return (
      <p className="flex items-center gap-2 text-foreground/70" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {t.common.loading}
      </p>
    );

  const total = state.tally ? state.tally.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/75">
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4" /> {state.participantCount} {t.live.participants}
        </span>
        {state.status === "running" && (
          <span className="badge badge-info">
            {t.live.questionLabel} {state.currentQIdx + 1} {t.live.of} {state.totalQuestions}
          </span>
        )}
      </div>

      {state.status === "waiting" && (
        <div className="card-elevated p-8 text-center">
          <div className="text-sm font-semibold uppercase tracking-wide text-foreground/70">
            {t.live.joinCodeLabel}
          </div>
          <div className="font-heading my-2 select-all text-5xl font-extrabold tracking-[0.3em] text-gradient-hero">
            {state.joinCode}
          </div>
          <p className="mb-6 text-sm text-foreground/75">{t.live.shareCode}</p>
          <button onClick={() => control("start")} disabled={busy} className="btn-solid btn-solid-primary mx-auto">
            <Play className="h-4 w-4" /> {t.live.start}
          </button>
        </div>
      )}

      {state.status === "running" && state.question && (
        <div className="card-elevated p-6">
          <h2 className="font-heading text-2xl font-extrabold">{state.question.q}</h2>
          {state.question.pinyin && <p className="mt-1 text-foreground/70">{state.question.pinyin}</p>}

          <div className="mt-5 space-y-2">
            {state.question.options.map((opt, i) => {
              const count = state.tally?.[i] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const isCorrect = state.revealed && state.correct === i;
              return (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-xl border-2 px-4 py-3 ${
                    isCorrect ? "border-success" : "border-card-border"
                  }`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/15"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                  <div className="relative flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold">
                      {isCorrect && <CheckCircle2 className="h-4 w-4 text-success" />}
                      {opt}
                    </span>
                    <span className="text-sm text-foreground/75">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-foreground/75">
              {state.answeredCount}/{state.participantCount} {t.live.answered}
            </span>
            <div className="flex-1" />
            {!state.revealed && (
              <button onClick={() => control("reveal")} disabled={busy} className="btn-solid btn-solid-outline">
                <Eye className="h-4 w-4" /> {t.live.reveal}
              </button>
            )}
            <button onClick={() => control("next")} disabled={busy} className="btn-solid btn-solid-primary">
              {state.currentQIdx + 1 >= state.totalQuestions ? (
                <><Square className="h-4 w-4" /> {t.live.finish}</>
              ) : (
                <><SkipForward className="h-4 w-4" /> {t.live.next}</>
              )}
            </button>
          </div>
        </div>
      )}

      {state.status === "ended" && (
        <div className="card-elevated p-6">
          <h2 className="font-heading flex items-center gap-2 text-2xl font-extrabold">
            <Trophy className="h-6 w-6 text-warning" /> {t.live.leaderboard}
          </h2>
          <ol className="mt-4 space-y-2">
            {(state.leaderboard ?? []).map((row, i) => (
              <li key={i} className="card-flat flex items-center justify-between px-5 py-3">
                <span className="font-semibold">
                  {i + 1}. {row.name}
                </span>
                <span className="badge badge-primary">{row.correct} {t.live.points}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
