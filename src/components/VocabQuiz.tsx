"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
import { t } from "@/i18n";
import { useAudioPlayer } from "@/lib/useAudioPlayer";
import type { VocabWord } from "@/lib/vocab";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const QUIZ_LEN = 12;

export default function VocabQuiz({
  words,
  level,
}: {
  words: VocabWord[];
  level: string;
}) {
  const [round, setRound] = useState(0); // bump to reshuffle
  const questions = useMemo(() => {
    void round;
    const picked = shuffle(words).slice(0, Math.min(QUIZ_LEN, words.length));
    return picked.map((w) => {
      const distractors = shuffle(words.filter((x) => x.id !== w.id)).slice(0, 3);
      return { word: w, options: shuffle([w, ...distractors]) };
    });
  }, [words, round]);

  const [qi, setQi] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const { play } = useAudioPlayer();

  const q = questions[qi];
  const answered = selected !== null;

  async function choose(optId: string) {
    if (answered || !q) return;
    setSelected(optId);
    const correct = optId === q.word.id;
    if (correct) setScore((s) => s + 1);
    void play(q.word.hanzi);
    try {
      await fetch("/api/vocab/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: q.word.id, level, hanzi: q.word.hanzi, correct }),
      });
    } catch {
      /* progress save is best-effort (e.g. signed out) */
    }
  }

  if (qi >= questions.length) {
    return (
      <div className="card-elevated mx-auto max-w-md p-8 text-center">
        <h2 className="font-heading text-2xl font-extrabold">{t.vocab.quizComplete}</h2>
        <p className="mt-2 text-lg">
          {t.vocab.score}: {score} / {questions.length}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            className="btn-solid btn-solid-primary"
            onClick={() => {
              setQi(0);
              setSelected(null);
              setScore(0);
              setRound((r) => r + 1);
            }}
          >
            {t.vocab.restart}
          </button>
          <Link href={`/vocab/${level}`} className="btn-solid btn-solid-outline">
            {t.vocab.back}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 flex items-center justify-between text-sm text-foreground/75">
        <span>
          {qi + 1} / {questions.length}
        </span>
        <span>
          {t.vocab.score}: {score}
        </span>
      </div>
      <div className="card-elevated p-6">
        <p className="text-sm text-foreground/75">{t.vocab.quizPrompt}</p>
        <p className="mt-1 text-xl font-semibold">{q.word.definition}</p>

        <div className="mt-5 grid grid-cols-2 gap-3" role="group" aria-label={t.vocab.quizPrompt}>
          {q.options.map((opt) => {
            const isCorrect = opt.id === q.word.id;
            const cls = !answered
              ? "card-interactive"
              : isCorrect
                ? "card-flat border-2 border-success bg-success/10"
                : opt.id === selected
                  ? "card-flat border-2 border-error bg-error/10"
                  : "card-flat opacity-50";
            return (
              <button
                key={opt.id}
                disabled={answered}
                onClick={() => choose(opt.id)}
                className={`${cls} p-4 text-center font-heading text-2xl font-bold`}
              >
                {opt.hanzi}
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className="mt-4 text-center" aria-live="polite">
            <p
              className={
                selected === q.word.id
                  ? "font-bold text-success"
                  : "font-bold text-error"
              }
            >
              {selected === q.word.id ? t.vocab.correct : t.vocab.wrong}
            </p>
            <p className="mt-1 text-sm text-primary">
              {q.word.hanzi} · {q.word.pinyin}
            </p>
            <button
              onClick={() => {
                setSelected(null);
                setQi((i) => i + 1);
              }}
              className="btn-solid btn-solid-primary mt-3"
            >
              {t.vocab.next}
            </button>
          </div>
        ) : (
          <button
            onClick={() => void play(q.word.hanzi)}
            className="btn-ghost mx-auto mt-4"
          >
            <Volume2 className="h-4 w-4" /> {t.vocab.play}
          </button>
        )}
      </div>
    </div>
  );
}
