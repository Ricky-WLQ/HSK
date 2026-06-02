"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, X, Loader2, Sparkles } from "lucide-react";
import { t } from "@/i18n";
import type { HskPracticeSet, HskQuestion } from "@/lib/exam";

type Dimension = { name: string; score: number; comment: string };
type Grade = { score: number; band: string; dimensions: Dimension[]; feedback: string };

function normalize(s: string): string {
  return s.replace(/[\s，。、！？,.!?]/g, "").trim();
}

function fillCharCorrect(q: HskQuestion, answer: string | undefined): boolean {
  if (!answer) return false;
  const a = normalize(answer);
  const refs = [q.correctAnswer, ...(q.acceptableAnswers ?? [])].map(normalize);
  return refs.some((r) => r.length > 0 && a === r);
}

export default function WritingRunner({ set }: { set: HskPracticeSet }) {
  const allQuestions = useMemo(() => set.groups.flatMap((g) => g.questions), [set]);
  const total = allQuestions.length;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [grading, setGrading] = useState<Set<string>>(new Set());
  const [gradeError, setGradeError] = useState<Record<string, string>>({});
  const savedRef = useRef(false);
  const abortRef = useRef<AbortController[]>([]);

  useEffect(() => {
    const controllers = abortRef.current;
    return () => controllers.forEach((c) => c.abort());
  }, []);

  // A question "passes" if a fill-char exact match, else an AI score >= 60.
  const passed = useCallback(
    (q: HskQuestion): boolean => {
      if (q.type === "writing-fill-char") return fillCharCorrect(q, answers[q.id]);
      return (grades[q.id]?.score ?? 0) >= 60;
    },
    [answers, grades],
  );

  const score = useMemo(
    () => allQuestions.filter((q) => checked.has(q.id) && passed(q)).length,
    [allQuestions, checked, passed],
  );
  const done = total > 0 && checked.size === total;

  const saveAttempt = useCallback(
    (correctCount: number) => {
      if (savedRef.current) return;
      savedRef.current = true;
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
    [set, total, answers],
  );

  const finishIfDone = useCallback(
    (nextChecked: Set<string>, extraPass?: HskQuestion) => {
      if (nextChecked.size !== total) return;
      const correct = allQuestions.filter(
        (q) => nextChecked.has(q.id) && (q === extraPass ? true : passed(q)),
      ).length;
      saveAttempt(correct);
    },
    [allQuestions, total, passed, saveAttempt],
  );

  const checkFillChar = useCallback(
    (q: HskQuestion) => {
      if (checked.has(q.id) || !answers[q.id]) return;
      const next = new Set(checked).add(q.id);
      setChecked(next);
      finishIfDone(next);
    },
    [checked, answers, finishIfDone],
  );

  const submitGrade = useCallback(
    async (q: HskQuestion) => {
      if (checked.has(q.id) || grading.has(q.id) || !(answers[q.id] ?? "").trim()) return;
      setGradeError((m) => {
        if (!(q.id in m)) return m;
        const n = { ...m };
        delete n[q.id];
        return n;
      });
      setGrading((s) => new Set(s).add(q.id));
      const controller = new AbortController();
      abortRef.current.push(controller);
      try {
        const res = await fetch("/api/practice/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            level: set.level,
            type: q.type,
            prompt: q.prompt,
            givenWord: q.givenWord ?? "",
            sourceText: q.sourceText ?? "",
            sample: q.sample ?? "",
            minChars: q.minChars ?? 0,
            studentText: answers[q.id],
          }),
        });
        if (res.ok) {
          const g = (await res.json()) as Grade;
          setGrades((m) => ({ ...m, [q.id]: g }));
          const next = new Set(checked).add(q.id);
          setChecked(next);
          finishIfDone(next, q);
        } else {
          setGradeError((m) => ({ ...m, [q.id]: t.practice.gradeFailed }));
        }
      } catch (err) {
        // Ignore aborts (component unmount); surface real failures so grading isn't silent.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setGradeError((m) => ({ ...m, [q.id]: t.practice.gradeFailed }));
        }
      } finally {
        setGrading((s) => {
          const n = new Set(s);
          n.delete(q.id);
          return n;
        });
      }
    },
    [checked, grading, answers, set, finishIfDone],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/practice/${set.level}/${set.section}`}
          className="text-sm text-foreground/75 hover:underline"
        >
          ← {t.practice.backToSets}
        </Link>
        <span className="text-sm font-semibold">
          {t.practice.score}: {score} / {total}
        </span>
      </div>

      {set.groups.map((group) => (
        <div key={group.id} className="card-elevated mb-6 p-6">
          <p className="mb-4 text-sm text-foreground/75">{group.instruction}</p>

          <div className="space-y-7">
            {group.questions.map((q, qi) => {
              const isChecked = checked.has(q.id);
              const isFill = q.type === "writing-fill-char";
              const fillOk = isFill && fillCharCorrect(q, answers[q.id]);
              const g = grades[q.id];
              return (
                <div key={q.id} className="border-t border-card-border pt-4 first:border-t-0 first:pt-0">
                  <div className="mb-2 flex gap-2">
                    <span className="font-semibold text-foreground/70">{qi + 1}.</span>
                    <div className="flex-1">
                      {q.prompt && <div className="leading-relaxed">{q.prompt}</div>}
                      {q.pinyin && <div className="text-xs text-primary">{q.pinyin}</div>}
                      {q.givenWord && (
                        <div className="mt-1 text-sm">
                          {t.practice.givenWord}: <span className="font-bold text-primary">{q.givenWord}</span>
                        </div>
                      )}
                      {q.sourceText && (
                        <div className="mt-2 rounded-xl bg-surface p-3 text-sm leading-relaxed">{q.sourceText}</div>
                      )}
                      {q.minChars ? (
                        <div className="mt-1 text-xs text-foreground/70">≥ {q.minChars} {t.practice.chars}</div>
                      ) : null}
                    </div>
                  </div>

                  {/* single picture (writing-sentence) or 4-panel grid (writing-essay) */}
                  {q.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.imageUrl}
                      alt={t.practice.picture}
                      className="my-2 max-h-48 rounded-xl border border-card-border object-contain"
                    />
                  )}
                  {q.images && q.images.length > 0 && (
                    <div className="my-2 grid grid-cols-2 gap-2">
                      {q.images.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={src}
                          alt={`${t.practice.picture} ${i + 1}`}
                          className="aspect-square w-full rounded-lg border border-card-border object-cover"
                        />
                      ))}
                    </div>
                  )}

                  {isFill ? (
                    <input
                      className="input-clay mt-2 w-24 text-center text-lg"
                      maxLength={2}
                      disabled={isChecked}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  ) : (
                    <textarea
                      className="input-clay mt-2 min-h-28 w-full"
                      placeholder={t.practice.writeHere}
                      disabled={isChecked}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  )}
                  {!isFill && (
                    <div className="mt-1 text-right text-xs text-foreground/65">
                      {(answers[q.id] ?? "").length} {t.practice.chars}
                    </div>
                  )}

                  {!isChecked ? (
                    <>
                      <button
                        onClick={() => (isFill ? checkFillChar(q) : submitGrade(q))}
                        disabled={!(answers[q.id] ?? "").trim() || grading.has(q.id)}
                        className="btn-solid btn-solid-primary mt-3 disabled:opacity-40"
                      >
                        {grading.has(q.id) ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> {t.practice.grading}
                          </>
                        ) : isFill ? (
                          t.practice.check
                        ) : gradeError[q.id] ? (
                          <>
                            <Sparkles className="h-4 w-4" /> {t.practice.retry}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" /> {t.practice.submitGrade}
                          </>
                        )}
                      </button>
                      {gradeError[q.id] && (
                        <p role="alert" className="mt-2 text-sm font-semibold text-error">
                          {gradeError[q.id]}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="mt-3 animate-scale-in">
                      {isFill ? (
                        <p className={`flex items-center gap-1 font-bold ${fillOk ? "text-success" : "text-error"}`}>
                          {fillOk ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          {fillOk ? t.practice.correct : t.practice.wrong}
                          <span className="ml-2 font-normal text-foreground/70">
                            {t.practice.reference}: {q.correctAnswer}
                          </span>
                        </p>
                      ) : g ? (
                        <div className="rounded-xl bg-surface p-4">
                          <div className="flex items-baseline gap-3">
                            <span className="font-heading text-3xl font-extrabold text-primary">{g.score}</span>
                            <span className="text-sm text-foreground/70">/ 100</span>
                            {g.band && <span className="badge badge-primary">{g.band}</span>}
                          </div>
                          {g.dimensions.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {g.dimensions.map((d, i) => (
                                <div key={i} className="text-sm">
                                  <span className="font-semibold">{d.name}</span>
                                  <span className="ml-2 text-foreground/70">{d.score}</span>
                                  <span className="ml-2 text-foreground/70">{d.comment}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {g.feedback && <p className="mt-3 text-sm text-foreground/80">{g.feedback}</p>}
                        </div>
                      ) : null}
                      {q.sample && (
                        <div className="mt-2 rounded-xl border border-card-border p-3 text-sm">
                          <span className="font-semibold">{t.practice.sampleAnswer}:</span>{" "}
                          <span className="text-foreground/80">{q.sample}</span>
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
          <Link href={`/practice/${set.level}/${set.section}`} className="btn-solid btn-solid-primary mt-5">
            {t.practice.backToSets}
          </Link>
        </div>
      )}
    </div>
  );
}
