"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Check, X, Languages, Loader2 } from "lucide-react";
import { t } from "@/i18n";
import type { HskPracticeSet, HskQuestion, HskGroup } from "@/lib/exam";

type Analysis = { summary: string; analysis: string; relatedVocab: string[] };

function normalize(s: string): string {
  return s.replace(/[\s，。、！？,.!?]/g, "").trim();
}

function isCorrect(q: HskQuestion, answer: string | undefined): boolean {
  if (!answer) return false;
  if (q.type === "short-answer") {
    const a = normalize(answer);
    const refs = [q.correctAnswer, ...(q.acceptableAnswers ?? [])].map(normalize);
    return refs.some((r) => r.length > 0 && (a === r || a.includes(r) || r.includes(a)));
  }
  return answer === q.correctAnswer;
}

export default function ReadingRunner({ set }: { set: HskPracticeSet }) {
  const allQuestions = useMemo(() => set.groups.flatMap((g) => g.questions), [set]);
  const total = allQuestions.length;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<Record<string, Analysis>>({});
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [showPinyin, setShowPinyin] = useState(true);
  const [saved, setSaved] = useState(false);

  const score = useMemo(
    () => allQuestions.filter((q) => checked.has(q.id) && isCorrect(q, answers[q.id])).length,
    [allQuestions, checked, answers],
  );
  const done = checked.size === total;

  const saveAttempt = useCallback(
    (correctCount: number) => {
      if (saved) return;
      setSaved(true);
      void fetch("/api/practice/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: set.level,
          section: set.section,
          contentId: set.id,
          totalQuestions: total,
          correctCount,
          answers,
        }),
      }).catch(() => {});
    },
    [saved, set, total, answers],
  );

  const check = useCallback(
    async (q: HskQuestion, group: HskGroup) => {
      if (checked.has(q.id) || answers[q.id] == null) return;
      const nextChecked = new Set(checked).add(q.id);
      setChecked(nextChecked);
      const correctNow = allQuestions.filter(
        (x) => nextChecked.has(x.id) && isCorrect(x, answers[x.id]),
      ).length;
      if (nextChecked.size === total) saveAttempt(correctNow);

      if (!isCorrect(q, answers[q.id]) && q.type !== "short-answer") {
        setAnalyzing((s) => new Set(s).add(q.id));
        try {
          const res = await fetch("/api/practice/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: set.level,
              section: set.section,
              contentId: set.id,
              questionId: q.id,
              passage: group.passage ?? "",
              bank: group.sharedBank ?? null,
              prompt: q.prompt,
              options: q.options ?? null,
              userAnswer: answers[q.id],
              correctAnswer: q.correctAnswer,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as Analysis;
            setAnalysis((a) => ({ ...a, [q.id]: data }));
          }
        } catch {
          /* best-effort */
        } finally {
          setAnalyzing((s) => {
            const n = new Set(s);
            n.delete(q.id);
            return n;
          });
        }
      }
    },
    [checked, answers, allQuestions, total, set, saveAttempt],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/practice/${set.level}/reading`}
          className="text-sm text-foreground/60 hover:underline"
        >
          ← {t.practice.backToSets}
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPinyin((v) => !v)}
            className={`chip ${showPinyin ? "chip-active" : ""}`}
          >
            <Languages className="h-3.5 w-3.5" /> {t.practice.showPinyin}
          </button>
          <span className="text-sm font-semibold">
            {t.practice.score}: {score} / {total}
          </span>
        </div>
      </div>

      {set.groups.map((group) => (
        <div key={group.id} className="card-elevated mb-6 p-6">
          <p className="mb-4 text-sm text-foreground/60">{group.instruction}</p>

          {group.passage && (
            <div className="mb-5 rounded-xl bg-surface p-4">
              <div className="text-[15px] leading-relaxed">{group.passage}</div>
              {showPinyin && group.passagePinyin && (
                <div className="mt-1 text-xs text-primary/80">{group.passagePinyin}</div>
              )}
            </div>
          )}

          {group.sharedBank && (
            <div className="mb-5 rounded-xl border border-card-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-foreground/50">
                {t.practice.wordBank}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.sharedBank.map((o) => (
                  <div key={o.label} className="flex items-baseline gap-2 text-sm">
                    <span className="font-bold text-primary">{o.label}</span>
                    <span>
                      {o.text}
                      {showPinyin && o.pinyin && (
                        <span className="ml-1 text-xs text-primary/70">{o.pinyin}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-5">
            {group.questions.map((q, qi) => {
              const isChecked = checked.has(q.id);
              const correct = isCorrect(q, answers[q.id]);
              const bankLetters = group.sharedBank && !q.options ? group.sharedBank.map((o) => o.label) : null;
              return (
                <div key={q.id} className="border-t border-card-border pt-4 first:border-t-0 first:pt-0">
                  <div className="mb-2 flex gap-2">
                    <span className="font-semibold text-foreground/50">{qi + 1}.</span>
                    <div>
                      <div className="leading-relaxed">{q.prompt}</div>
                      {showPinyin && q.pinyin && (
                        <div className="text-xs text-primary/80">{q.pinyin}</div>
                      )}
                    </div>
                  </div>

                  {q.type === "short-answer" ? (
                    <input
                      className="input-clay w-full"
                      placeholder={t.practice.typePrompt}
                      disabled={isChecked}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  ) : bankLetters ? (
                    <div className="flex flex-wrap gap-2">
                      {bankLetters.map((L) => {
                        const sel = answers[q.id] === L;
                        const cls = isChecked
                          ? L === q.correctAnswer
                            ? "border-success bg-success/10"
                            : sel
                              ? "border-error bg-error/10"
                              : "opacity-50"
                          : sel
                            ? "border-primary bg-primary-lighter"
                            : "";
                        return (
                          <button
                            key={L}
                            disabled={isChecked}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: L }))}
                            className={`h-9 w-9 rounded-lg border-2 font-bold ${cls}`}
                          >
                            {L}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {(q.options ?? []).map((o) => {
                        const sel = answers[q.id] === o.label;
                        const cls = isChecked
                          ? o.label === q.correctAnswer
                            ? "border-success bg-success/10"
                            : sel
                              ? "border-error bg-error/10"
                              : "opacity-50"
                          : sel
                            ? "border-primary bg-primary-lighter"
                            : "card-interactive";
                        return (
                          <button
                            key={o.label}
                            disabled={isChecked}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.label }))}
                            className={`flex items-start gap-2 rounded-xl border-2 p-3 text-left ${cls}`}
                          >
                            <span className="font-bold text-primary">{o.label}</span>
                            <span>
                              {o.text}
                              {showPinyin && o.pinyin && (
                                <span className="ml-1 text-xs text-primary/70">{o.pinyin}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {!isChecked ? (
                    <button
                      onClick={() => check(q, group)}
                      disabled={answers[q.id] == null || answers[q.id] === ""}
                      className="btn-solid btn-solid-primary mt-3 disabled:opacity-40"
                    >
                      {t.practice.check}
                    </button>
                  ) : (
                    <div className="mt-3 animate-scale-in">
                      <p className={`flex items-center gap-1 font-bold ${correct ? "text-success" : "text-error"}`}>
                        {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        {correct ? t.practice.correct : t.practice.wrong}
                        {q.type === "short-answer" && (
                          <span className="ml-2 font-normal text-foreground/70">
                            {t.practice.reference}: {q.correctAnswer}
                          </span>
                        )}
                      </p>
                      {q.explanation && (
                        <p className="mt-1 text-sm text-foreground/70">
                          <span className="font-semibold">{t.practice.explanation}:</span> {q.explanation}
                        </p>
                      )}
                      {analyzing.has(q.id) && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-foreground/50">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.practice.analyzing}
                        </p>
                      )}
                      {analysis[q.id] && (
                        <div className="mt-2 rounded-xl bg-surface p-3 text-sm">
                          <div className="font-semibold">{analysis[q.id].summary}</div>
                          <div className="mt-1 text-foreground/70">{analysis[q.id].analysis}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {done && (
        <div className="card-elevated mb-10 p-6 text-center">
          <h2 className="font-heading text-2xl font-extrabold">{t.practice.complete}</h2>
          <p className="mt-2 text-lg">
            {t.practice.score}: {score} / {total}
          </p>
          <Link href={`/practice/${set.level}/reading`} className="btn-solid btn-solid-primary mt-5">
            {t.practice.backToSets}
          </Link>
        </div>
      )}
    </div>
  );
}
