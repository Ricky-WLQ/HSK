"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Clock, Loader2, Volume2 } from "lucide-react";
import { t } from "@/i18n";
import QuestionView, { AudioClip } from "@/components/QuestionView";
import type { AssembledExam } from "@/lib/mock";
import type { HskQuestion } from "@/lib/exam";

const AI_TYPES = new Set(["writing-sentence", "writing-essay", "translation-passage"]);

function normalize(s: string): string {
  return s.replace(/[\s，。、！？,.!?]/g, "").trim();
}
function autoCorrect(q: HskQuestion, ans: string | undefined): boolean {
  if (!ans) return false;
  if (q.type === "writing-fill-char") return normalize(ans) === normalize(q.correctAnswer);
  if (q.type === "short-answer" || q.type === "listening-dictation") {
    const a = normalize(ans);
    if (!a) return false;
    const refs = [q.correctAnswer, ...(q.acceptableAnswers ?? [])].map(normalize);
    // Exact match after normalization (incl. acceptableAnswers); `includes` was too
    // lenient — a superset/negated answer would wrongly pass.
    return refs.some((r) => r.length > 0 && a === r);
  }
  return ans === q.correctAnswer;
}
function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Grade = { score: number; band: string; feedback: string };
type SectionResult = {
  labelEn: string;
  autoCorrect: number;
  autoTotal: number;
  ai: { q: HskQuestion; answer: string; grade?: Grade }[];
};

export default function ExamRunner({ exam }: { exam: AssembledExam }) {
  const [phase, setPhase] = useState<"intro" | "running" | "results">("intro");
  const [sectionIdx, setSectionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [showPinyin, setShowPinyin] = useState(false);
  const [grading, setGrading] = useState(false);
  const [results, setResults] = useState<SectionResult[] | null>(null);
  const savedRef = useRef(false);
  const finishingRef = useRef(false);
  const advanceRef = useRef<() => void>(() => {});

  const section = exam.sections[sectionIdx];
  const isDiagnostic = exam.mode === "diagnostic";
  const allQuestions = useMemo(
    () => exam.sections.flatMap((s) => s.sets.flatMap((set) => set.groups.flatMap((g) => g.questions))),
    [exam],
  );

  const finish = useCallback(async () => {
    if (finishingRef.current) return; // guard against a double-tap firing duplicate grade fetches
    finishingRef.current = true;
    setPhase("results");
    if (typeof window !== "undefined") window.scrollTo(0, 0);
    setGrading(true);
    const aiQs = allQuestions.filter((q) => AI_TYPES.has(q.type) && (answers[q.id] ?? "").trim());
    const grades: Record<string, Grade> = {};
    await Promise.all(
      aiQs.map(async (q) => {
        try {
          const res = await fetch("/api/practice/grade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: exam.level,
              type: q.type,
              prompt: q.prompt,
              givenWord: q.givenWord,
              sourceText: q.sourceText,
              sample: q.sample,
              minChars: q.minChars,
              studentText: answers[q.id],
            }),
          });
          if (res.ok) grades[q.id] = (await res.json()) as Grade;
        } catch {
          /* best-effort */
        }
      }),
    );

    const secResults: SectionResult[] = exam.sections.map((sec) => {
      const qs = sec.sets.flatMap((s) => s.groups.flatMap((g) => g.questions));
      const autoQs = qs.filter((q) => !AI_TYPES.has(q.type));
      const aiList = qs.filter((q) => AI_TYPES.has(q.type));
      return {
        labelEn: sec.labelEn,
        autoTotal: autoQs.length,
        autoCorrect: autoQs.filter((q) => autoCorrect(q, answers[q.id])).length,
        ai: aiList.map((q) => ({ q, answer: answers[q.id] ?? "", grade: grades[q.id] })),
      };
    });
    setResults(secResults);
    setGrading(false);

    if (!savedRef.current) {
      savedRef.current = true;
      const autoCorrectN = secResults.reduce((n, s) => n + s.autoCorrect, 0);
      const aiPass = secResults.reduce(
        (n, s) => n + s.ai.filter((a) => (a.grade?.score ?? 0) >= 60).length,
        0,
      );
      void fetch("/api/practice/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: exam.level,
          section: exam.mode === "diagnostic" ? "diagnostic" : "mock",
          contentId: `hsk${exam.level}-${exam.mode}`,
          totalQuestions: allQuestions.length,
          correctCount: autoCorrectN + aiPass,
          answers,
        }),
      }).catch(() => {});
    }
  }, [exam, allQuestions, answers]);

  const advance = useCallback(() => {
    setSectionIdx((idx) => {
      if (idx + 1 < exam.sections.length) {
        setTimeLeft(exam.sections[idx + 1].minutes * 60);
        if (typeof window !== "undefined") window.scrollTo(0, 0);
        return idx + 1;
      }
      void finish();
      return idx;
    });
  }, [exam, finish]);
  advanceRef.current = advance;

  // Per-section countdown. Restarts on section change; auto-advances at 0.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          advanceRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, sectionIdx]);

  function startExam() {
    setSectionIdx(0);
    setTimeLeft(exam.sections[0].minutes * 60);
    setPhase("running");
  }

  // ---- INTRO ----
  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card-elevated p-6">
          <h1 className="font-heading text-2xl font-extrabold">
            HSK {exam.level} {isDiagnostic ? t.exam.diagnosticTitle : t.exam.title}
          </h1>
          <p className="mt-1 text-foreground/75">{isDiagnostic ? t.exam.diagnosticIntro : t.exam.intro}</p>
          <ul className="mt-4 divide-y divide-card-border">
            {exam.sections.map((s) => (
              <li key={s.section} className="flex items-center justify-between py-2">
                <span className="font-semibold">{s.labelEn}</span>
                <span className="text-sm text-foreground/75">
                  {s.questionCount} {t.exam.questions} · {s.minutes} {t.exam.minutes}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between text-sm font-semibold">
            <span>{t.exam.total}</span>
            <span>
              {exam.totalQuestions} {t.exam.questions} · {exam.totalMinutes} {t.exam.minutes}
            </span>
          </div>
          <p className="mt-4 text-xs text-foreground/70">{t.exam.lockNote}</p>
          <button onClick={startExam} className="btn-solid btn-solid-primary mt-5 w-full">
            {t.exam.start}
          </button>
        </div>
      </div>
    );
  }

  // ---- RESULTS ----
  if (phase === "results") {
    const totalAuto = results?.reduce((n, s) => n + s.autoTotal, 0) ?? 0;
    const totalAutoCorrect = results?.reduce((n, s) => n + s.autoCorrect, 0) ?? 0;
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-heading text-2xl font-extrabold">{t.exam.results}</h1>
        {grading && (
          <p className="mt-2 flex items-center gap-2 text-foreground/75">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.exam.grading}
          </p>
        )}
        {results && (
          <>
            <div className="card-elevated mt-4 p-6 text-center">
              <div className="text-4xl font-extrabold text-primary">
                {totalAutoCorrect} / {totalAuto}
              </div>
              <div className="text-sm text-foreground/75">{t.exam.objectiveScore}</div>
            </div>
            {results.map((s) => (
              <div key={s.labelEn} className="card-elevated mt-4 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-lg font-bold">{s.labelEn}</h2>
                  {s.autoTotal > 0 && (
                    <span className="font-semibold">
                      {s.autoCorrect} / {s.autoTotal}
                    </span>
                  )}
                </div>
                {s.ai.map(({ q, answer, grade }, i) => (
                  <div key={i} className="mt-3 rounded-xl bg-surface p-4">
                    <div className="text-sm text-foreground/75">{q.prompt || q.sourceText}</div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{answer || "—"}</div>
                    {grade ? (
                      <div className="mt-2 text-sm">
                        <span className="font-bold text-primary">
                          {t.exam.writtenScore}: {grade.score}/100
                        </span>
                        {grade.band && <span className="ml-2 badge badge-info">{grade.band}</span>}
                        {grade.feedback && <p className="mt-1 text-foreground/70">{grade.feedback}</p>}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-foreground/65">{t.exam.notGraded}</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-6 mb-10 flex gap-3">
              <Link href={isDiagnostic ? "/diagnostic" : "/exam"} className="btn-solid btn-solid-secondary">
                {t.exam.back}
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- RUNNING ----
  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-16 z-10 mb-4 flex items-center justify-between rounded-xl bg-background/90 px-3 py-2 backdrop-blur">
        <div className="text-sm font-semibold">
          {section.labelEn}
          <span className="ml-2 text-foreground/65">
            {sectionIdx + 1}/{exam.sections.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPinyin((v) => !v)}
            aria-pressed={showPinyin}
            className={`chip ${showPinyin ? "chip-active" : ""}`}
          >
            {t.exam.pinyin}
          </button>
          <span
            role="timer"
            aria-label={timeLeft <= 30 ? t.exam.timeAlmostUp : undefined}
            title={timeLeft <= 30 ? t.exam.timeAlmostUp : undefined}
            className={`flex items-center gap-1 font-mono font-bold ${
              timeLeft <= 30 ? "text-error animate-pulse" : "text-foreground"
            }`}
          >
            <Clock className="h-4 w-4" /> {fmt(timeLeft)}
          </span>
        </div>
      </div>

      {section.sets.map((set) =>
        set.groups.map((group) => {
          let n = 0;
          return (
            <div key={`${set.id}-${group.id}`} className="card-elevated mb-6 p-6">
              <p className="mb-3 text-sm text-foreground/75">{group.instruction}</p>
              {group.audio && (
                <div className="mb-5 rounded-xl bg-surface p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Volume2 className="h-4 w-4" /> {t.practice.listenAudio}
                  </div>
                  <AudioClip clipKey={group.audio.key} />
                </div>
              )}
              {group.passage && (
                <div className="mb-5 rounded-xl bg-surface p-4 text-[15px] leading-relaxed">
                  {group.passage}
                  {showPinyin && group.passagePinyin && (
                    <div className="mt-1 text-sm text-primary">{group.passagePinyin}</div>
                  )}
                </div>
              )}
              {group.sharedBank && group.sharedBank.some((o) => o.imageUrl) ? (
                <div className="mb-5 grid grid-cols-3 gap-2">
                  {group.sharedBank.map((o) => (
                    <div key={o.label} className="rounded-xl border border-card-border p-1 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={o.imageUrl} alt={`${t.practice.picture} ${o.label}`} className="aspect-square w-full rounded-lg object-cover" />
                      <span className="text-xs font-bold text-primary">{o.label}</span>
                    </div>
                  ))}
                </div>
              ) : group.sharedBank ? (
                <div className="mb-5 rounded-xl border border-card-border p-3">
                  <div className="mb-2 text-xs font-semibold uppercase text-foreground/70">{t.practice.wordBank}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {group.sharedBank.map((o) => (
                      <div key={o.label} className="flex items-baseline gap-2 text-sm">
                        <span className="font-bold text-primary">{o.label}</span>
                        <span>{o.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-5">
                {group.questions.map((q) => {
                  n += 1;
                  return (
                    <QuestionView
                      key={q.id}
                      group={group}
                      question={q}
                      index={n}
                      answer={answers[q.id] ?? ""}
                      onAnswer={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                      showPinyin={showPinyin}
                      disabled={false}
                    />
                  );
                })}
              </div>
            </div>
          );
        }),
      )}

      <div className="mb-10 flex justify-end">
        <button
          onClick={() => {
            const isLast = sectionIdx + 1 >= exam.sections.length;
            if (confirm(isLast ? t.exam.confirmFinish : t.exam.confirmSubmitSection)) advance();
          }}
          className="btn-solid btn-solid-primary"
        >
          {sectionIdx + 1 < exam.sections.length ? t.exam.submitSection : t.exam.finish}
        </button>
      </div>
    </div>
  );
}
