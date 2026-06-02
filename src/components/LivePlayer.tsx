"use client";

import { useState } from "react";
import { Users, Trophy, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { useLiveState } from "@/components/useLiveState";
import { t } from "@/i18n";

export default function LivePlayer({ sessionId }: { sessionId: string }) {
  const state = useLiveState(sessionId);
  const [busy, setBusy] = useState(false);

  async function answer(idx: number) {
    if (busy || !state || state.revealed) return;
    setBusy(true);
    try {
      await fetch(`/api/live/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIdx: state.currentQIdx, answer: idx }),
      });
    } finally {
      setBusy(false);
    }
  }

  if (state === null) {
    // either still connecting, or not a participant (SSE 404 → no messages)
    return (
      <p className="card-flat px-5 py-8 text-center text-foreground/60">{t.live.notJoined}</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/60">
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
        <div className="card-elevated p-10 text-center">
          <Hourglass className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-lg font-semibold">{t.live.waitingTeacher}</p>
        </div>
      )}

      {state.status === "running" && state.question && (
        <div className="card-elevated p-6">
          <h2 className="font-heading text-2xl font-extrabold">{state.question.q}</h2>
          {state.question.pinyin && <p className="mt-1 text-foreground/50">{state.question.pinyin}</p>}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {state.question.options.map((opt, i) => {
              const chosen = state.myAnswer === i;
              const isCorrect = state.revealed && state.correct === i;
              const chosenWrong = state.revealed && chosen && state.correct !== i;
              let cls = "border-card-border hover:border-primary";
              if (isCorrect) cls = "border-success bg-success/10";
              else if (chosenWrong) cls = "border-error bg-error/10";
              else if (chosen) cls = "border-primary bg-primary/10";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => answer(i)}
                  disabled={busy || state.revealed}
                  className={`flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 text-left text-base font-semibold transition disabled:cursor-default ${cls}`}
                >
                  <span>{opt}</span>
                  {isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
                  {chosenWrong && <XCircle className="h-5 w-5 shrink-0 text-error" />}
                </button>
              );
            })}
          </div>

          <div className="mt-4 text-sm">
            {state.revealed ? (
              state.myAnswer == null ? (
                <span className="text-foreground/50">{t.live.locked}</span>
              ) : state.myCorrect ? (
                <span className="font-semibold text-success">{t.live.correct}</span>
              ) : (
                <span className="font-semibold text-error">{t.live.incorrect}</span>
              )
            ) : state.myAnswer != null ? (
              <span className="text-foreground/60">
                {t.live.yourAnswer}: {state.question.options[state.myAnswer]}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {state.status === "ended" && (
        <div className="card-elevated p-6">
          <h2 className="font-heading flex items-center gap-2 text-2xl font-extrabold">
            <Trophy className="h-6 w-6 text-warning" /> {t.live.finished}
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
