"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, X, Languages, Loader2, Volume2 } from "lucide-react";
import { t } from "@/i18n";
import type { HskPracticeSet, HskQuestion, HskGroup } from "@/lib/exam";

type Analysis = { summary: string; analysis: string; relatedVocab: string[] };

function normalize(s: string): string {
  return s.replace(/[\s，。、！？,.!?]/g, "").trim();
}

function isCorrect(q: HskQuestion, answer: string | undefined): boolean {
  if (!answer) return false;
  if (q.type === "listening-dictation") {
    const a = normalize(answer);
    if (!a) return false;
    const refs = [q.correctAnswer, ...(q.acceptableAnswers ?? [])].map(normalize);
    // Exact match after normalization (incl. acceptableAnswers). `includes` was
    // too lenient — a superset/negated answer would wrongly pass.
    return refs.some((r) => r.length > 0 && a === r);
  }
  return answer === q.correctAnswer; // option letter or 对/错
}

function AudioClip({ clipKey }: { clipKey: string }) {
  // Native controls give unlimited replay + seek + progress (practice mode).
  return (
    <audio
      controls
      preload="none"
      className="mt-1 h-10 w-full"
      src={`/api/listening-audio?key=${encodeURIComponent(clipKey)}`}
    >
      <track kind="captions" />
    </audio>
  );
}

const TF = ["对", "错"];

export default function ListeningRunner({ set }: { set: HskPracticeSet }) {
  const allQuestions = useMemo(() => set.groups.flatMap((g) => g.questions), [set]);
  const total = allQuestions.length;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<Record<string, Analysis>>({});
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const [showPinyin, setShowPinyin] = useState(true);
  const savedRef = useRef(false);
  const abortRef = useRef<AbortController[]>([]);

  useEffect(() => {
    const controllers = abortRef.current;
    return () => controllers.forEach((c) => c.abort());
  }, []);

  const score = useMemo(
    () => allQuestions.filter((q) => checked.has(q.id) && isCorrect(q, answers[q.id])).length,
    [allQuestions, checked, answers],
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

  const check = useCallback(
    async (q: HskQuestion, group: HskGroup) => {
      if (checked.has(q.id) || answers[q.id] == null || answers[q.id] === "") return;
      const nextChecked = new Set(checked).add(q.id);
      setChecked(nextChecked);
      const correctNow = allQuestions.filter(
        (x) => nextChecked.has(x.id) && isCorrect(x, answers[x.id]),
      ).length;
      if (nextChecked.size === total) saveAttempt(correctNow);

      // AI explanation for wrong MCQ items (not true/false or dictation).
      if (!isCorrect(q, answers[q.id]) && q.type === "listening-mcq") {
        setAnalyzing((s) => new Set(s).add(q.id));
        const controller = new AbortController();
        abortRef.current.push(controller);
        try {
          const transcript = group.audio?.transcript ?? q.audio?.transcript ?? "";
          const res = await fetch("/api/practice/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              level: set.level,
              section: set.section,
              contentId: set.id,
              questionId: q.id,
              passage: transcript,
              prompt: q.prompt,
              options: q.options ?? null,
              userAnswer: answers[q.id],
              correctAnswer: q.correctAnswer,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as Analysis;
            if (data.summary || data.analysis) setAnalysis((a) => ({ ...a, [q.id]: data }));
          }
        } catch {
          /* aborted or best-effort */
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
          href={`/practice/${set.level}/listening`}
          className="text-sm text-foreground/75 hover:underline"
        >
          ← {t.practice.backToSets}
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPinyin((v) => !v)}
            aria-pressed={showPinyin}
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
          <p className="mb-3 text-sm text-foreground/75">{group.instruction}</p>

          {/* Shared passage/interview audio (clustered listening). */}
          {group.audio && (
            <div className="mb-5 rounded-xl bg-surface p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Volume2 className="h-4 w-4" /> {t.practice.listenAudio}
              </div>
              <AudioClip clipKey={group.audio.key} />
            </div>
          )}

          {/* Shared picture bank (picture-match). */}
          {group.sharedBank && group.sharedBank.some((o) => o.imageUrl) && (
            <div className="mb-5 grid grid-cols-3 gap-2">
              {group.sharedBank.map((o) => (
                <div key={o.label} className="rounded-xl border border-card-border p-1 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={o.imageUrl}
                    alt={`${t.practice.picture} ${o.label}`}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <span className="text-xs font-bold text-primary">{o.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-6">
            {group.questions.map((q, qi) => {
              const isChecked = checked.has(q.id);
              const correct = isCorrect(q, answers[q.id]);
              const bankLetters =
                q.type === "listening-picture-match" && group.sharedBank
                  ? group.sharedBank.map((o) => o.label)
                  : null;
              const transcript = group.audio?.transcript ?? q.audio?.transcript ?? "";
              const transcriptPinyin = group.audio?.transcriptPinyin ?? q.audio?.transcriptPinyin;
              return (
                <div key={q.id} className="border-t border-card-border pt-4 first:border-t-0 first:pt-0">
                  <div className="mb-2 flex gap-2">
                    <span className="font-semibold text-foreground/70">{qi + 1}.</span>
                    <div className="flex-1">
                      {q.prompt && (
                        <div className="leading-relaxed">{q.prompt}</div>
                      )}
                      {showPinyin && q.pinyin && (
                        <div className="text-xs text-primary/80">{q.pinyin}</div>
                      )}
                    </div>
                  </div>

                  {/* Per-item audio (independent listening items). */}
                  {q.audio && !group.audio && <AudioClip clipKey={q.audio.key} />}

                  {/* Single shown picture (picture-true-false). */}
                  {q.imageUrl && (
                    <div className="my-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={q.imageUrl}
                        alt={t.practice.picture}
                        className="max-h-56 rounded-xl border border-card-border object-contain"
                      />
                    </div>
                  )}

                  {/* Answer affordance by type. */}
                  {q.type === "listening-dictation" ? (
                    <input
                      className="input-clay mt-2 w-full"
                      placeholder={t.practice.typePrompt}
                      disabled={isChecked}
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  ) : q.type === "listening-picture-true-false" ||
                    q.type === "listening-statement-true-false" ? (
                    <div className="mt-2 flex gap-2" role="radiogroup">
                      {TF.map((v) => {
                        const sel = answers[q.id] === v;
                        const cls = isChecked
                          ? v === q.correctAnswer
                            ? "border-success bg-success/10"
                            : sel
                              ? "border-error bg-error/10"
                              : "opacity-50"
                          : sel
                            ? "border-primary bg-primary-lighter"
                            : "card-interactive";
                        return (
                          <button
                            key={v}
                            role="radio"
                            aria-checked={sel}
                            disabled={isChecked}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                            className={`h-11 w-20 rounded-xl border-2 text-lg font-bold ${cls}`}
                          >
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  ) : bankLetters ? (
                    <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
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
                            role="radio"
                            aria-checked={sel}
                            aria-label={`${t.practice.picture} ${L}`}
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
                    <div className="mt-2 grid gap-2" role="radiogroup">
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
                            role="radio"
                            aria-checked={sel}
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
                    <div className="mt-3 animate-scale-in" aria-live="polite">
                      <p className={`flex items-center gap-1 font-bold ${correct ? "text-success" : "text-error"}`}>
                        {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        {correct ? t.practice.correct : t.practice.wrong}
                        {q.type === "listening-dictation" && (
                          <span className="ml-2 font-normal text-foreground/70">
                            {t.practice.reference}: {q.correctAnswer}
                          </span>
                        )}
                      </p>
                      {/* Transcript revealed only after answering. */}
                      {transcript && (
                        <div className="mt-2 rounded-xl bg-surface p-3 text-sm">
                          <div className="text-xs font-semibold uppercase text-foreground/70">
                            {t.practice.transcript}
                          </div>
                          <div className="mt-1 leading-relaxed">{transcript}</div>
                          {showPinyin && transcriptPinyin && (
                            <div className="mt-1 text-xs text-primary/80">{transcriptPinyin}</div>
                          )}
                        </div>
                      )}
                      {q.explanation && (
                        <p className="mt-1 text-sm text-foreground/70">
                          <span className="font-semibold">{t.practice.explanation}:</span> {q.explanation}
                        </p>
                      )}
                      {analyzing.has(q.id) && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-foreground/70">
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
          <Link href={`/practice/${set.level}/listening`} className="btn-solid btn-solid-primary mt-5">
            {t.practice.backToSets}
          </Link>
        </div>
      )}
    </div>
  );
}
