"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, X, Languages } from "lucide-react";
import { t } from "@/i18n";
import type { GrammarPoint } from "@/lib/grammar";

// Inlined (pure) so this client component never imports the server-only
// loaders in @/lib/grammar (which pull in node:fs / node:path).
function groupByCategory(points: GrammarPoint[]): [string, GrammarPoint[]][] {
  const map = new Map<string, GrammarPoint[]>();
  for (const p of points) {
    const cat = p.category || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  return [...map.entries()];
}

export default function GrammarLevel({
  points,
  level,
}: {
  points: GrammarPoint[];
  level: string;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showPinyin, setShowPinyin] = useState(true);
  const [showEn, setShowEn] = useState(true);
  const savedRef = useRef(false);

  const groups = useMemo(() => groupByCategory(points), [points]);
  const drillKeys = useMemo(
    () => points.flatMap((p) => p.drills.map((_, i) => `${p.id}-d${i}`)),
    [points],
  );
  const total = drillKeys.length;

  const correctOf = useCallback(
    (chk: Set<string>, ans: Record<string, number>) =>
      points.reduce(
        (n, p) =>
          n +
          p.drills.filter((d, i) => chk.has(`${p.id}-d${i}`) && ans[`${p.id}-d${i}`] === d.answerIndex)
            .length,
        0,
      ),
    [points],
  );
  const score = correctOf(checked, answers);
  const done = total > 0 && checked.size === total;

  const saveAttempt = useCallback(
    (correctCount: number) => {
      if (savedRef.current) return;
      savedRef.current = true;
      void fetch("/api/practice/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          section: "grammar",
          contentId: `hsk${level}-grammar`,
          totalQuestions: total,
          correctCount,
          answers,
        }),
      }).catch(() => {});
    },
    [level, total, answers],
  );

  const check = useCallback(
    (key: string) => {
      if (checked.has(key) || answers[key] == null) return;
      const next = new Set(checked).add(key);
      setChecked(next);
      if (next.size === total) saveAttempt(correctOf(next, answers));
    },
    [checked, answers, total, saveAttempt, correctOf],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-16 z-10 mb-6 flex items-center justify-between rounded-xl bg-background/80 px-1 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPinyin((v) => !v)}
            aria-pressed={showPinyin}
            className={`chip ${showPinyin ? "chip-active" : ""}`}
          >
            <Languages className="h-3.5 w-3.5" /> {t.grammar.pinyin}
          </button>
          <button
            onClick={() => setShowEn((v) => !v)}
            aria-pressed={showEn}
            className={`chip ${showEn ? "chip-active" : ""}`}
          >
            {t.grammar.english}
          </button>
        </div>
        <span className="text-sm font-semibold">
          {t.grammar.score}: {score} / {total}
        </span>
      </div>

      {groups.map(([category, pts]) => (
        <section key={category} className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-foreground/65">
            {category}
          </h2>
          <div className="space-y-5">
            {pts.map((p) => (
              <div key={p.id} className="card-elevated p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-heading text-xl font-extrabold">
                    {p.nameZh}
                    {p.nameEn && (
                      <span className="ml-2 text-sm font-semibold text-foreground/70">
                        {p.nameEn}
                      </span>
                    )}
                  </h3>
                </div>
                {p.structuralForm && (
                  <div className="mt-2 inline-block rounded-lg bg-surface px-3 py-1 font-mono text-sm text-primary">
                    {p.structuralForm}
                  </div>
                )}
                {p.explanation && (
                  <p className="mt-2 text-sm leading-relaxed text-foreground/70">{p.explanation}</p>
                )}

                {p.examples.length > 0 && (
                  <ul className="mt-3 space-y-2 rounded-xl bg-surface p-4">
                    {p.examples.map((e, i) => (
                      <li key={i}>
                        <div className="text-[15px] leading-relaxed">{e.zh}</div>
                        {showPinyin && e.pinyin && (
                          <div className="text-sm text-primary">{e.pinyin}</div>
                        )}
                        {showEn && e.en && (
                          <div className="text-sm text-foreground/70">{e.en}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {p.drills.length > 0 && (
                  <div className="mt-4 border-t border-card-border pt-4">
                    <div className="mb-2 text-xs font-semibold uppercase text-foreground/70">
                      {t.grammar.practice}
                    </div>
                    <div className="space-y-4">
                      {p.drills.map((d, di) => {
                        const key = `${p.id}-d${di}`;
                        const isChecked = checked.has(key);
                        const sel = answers[key];
                        const correct = isChecked && sel === d.answerIndex;
                        return (
                          <div key={key}>
                            <div className="mb-2 flex gap-2 text-[15px] leading-relaxed">
                              <span className="font-semibold text-foreground/65">{di + 1}.</span>
                              <span>{d.prompt}</span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                              {d.options.map((o, oi) => {
                                const picked = sel === oi;
                                const cls = isChecked
                                  ? oi === d.answerIndex
                                    ? "border-success bg-success/10"
                                    : picked
                                      ? "border-error bg-error/10"
                                      : "opacity-50"
                                  : picked
                                    ? "border-primary bg-primary-lighter"
                                    : "card-interactive";
                                return (
                                  <button
                                    key={oi}
                                    role="radio"
                                    aria-checked={picked}
                                    disabled={isChecked}
                                    onClick={() => setAnswers((a) => ({ ...a, [key]: oi }))}
                                    className={`flex min-h-11 items-center rounded-xl border-2 p-2.5 text-left text-sm ${cls}`}
                                  >
                                    {o}
                                  </button>
                                );
                              })}
                            </div>
                            {!isChecked ? (
                              <button
                                onClick={() => check(key)}
                                disabled={sel == null}
                                className="btn-solid btn-solid-primary mt-2 disabled:opacity-40"
                              >
                                {t.grammar.check}
                              </button>
                            ) : (
                              <div className="mt-2 animate-scale-in" aria-live="polite">
                                <p
                                  className={`flex items-center gap-1 text-sm font-bold ${correct ? "text-success" : "text-error"}`}
                                >
                                  {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                  {correct ? t.grammar.correct : t.grammar.wrong}
                                </p>
                                {d.explanation && (
                                  <p className="mt-1 text-sm text-foreground/70">{d.explanation}</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {done && (
        <div className="card-elevated mb-10 p-6 text-center">
          <h2 className="font-heading text-2xl font-extrabold">{t.grammar.complete}</h2>
          <p className="mt-2 text-lg">
            {t.grammar.score}: {score} / {total}
          </p>
        </div>
      )}
    </div>
  );
}
