"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Volume2, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { t } from "@/i18n";
import type { VocabWord } from "@/lib/vocab";

export default function Flashcards({
  words,
  level,
}: {
  words: VocabWord[];
  level: string;
}) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const w = words[i];

  const play = useCallback(async (text: string) => {
    try {
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch {
      // autoplay may be blocked until first user gesture; ignore
    }
  }, []);

  const next = useCallback(
    () => setI((x) => Math.min(x + 1, words.length - 1)),
    [words.length],
  );
  const prev = useCallback(() => setI((x) => Math.max(x - 1, 0)), []);

  // Listen-and-follow: auto-play when the card changes.
  useEffect(() => {
    setRevealed(false);
    if (w) play(w.hanzi);
  }, [i, w, play]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setRevealed((r) => !r);
      } else if (e.key.toLowerCase() === "r" && w) {
        play(w.hanzi);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w, play, next, prev]);

  if (!w) return null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between text-sm text-foreground/60">
        <Link href={`/vocab/${level}`} className="hover:underline">
          ← {t.vocab.back}
        </Link>
        <span>
          {i + 1} / {words.length}
        </span>
      </div>

      <div className="card-elevated p-10 text-center">
        <div className="font-heading text-6xl font-extrabold leading-none">{w.hanzi}</div>
        <button
          onClick={() => play(w.hanzi)}
          className="btn-solid btn-solid-outline mx-auto mt-5"
        >
          <Volume2 className="h-4 w-4" /> {t.vocab.play}
        </button>

        {revealed ? (
          <div className="mt-6 animate-scale-in">
            <div className="text-xl font-semibold text-primary">
              {w.readings.join(" · ")}
            </div>
            {w.definition && <p className="mt-1 text-foreground/80">{w.definition}</p>}
            {w.examples?.[0] && (
              <div className="mt-4 rounded-xl bg-surface p-3 text-left text-sm">
                <div className="font-medium">{w.examples[0].hanzi}</div>
                <div className="text-primary">{w.examples[0].pinyin}</div>
                <div className="text-foreground/60">{w.examples[0].english}</div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setRevealed(true)} className="btn-ghost mt-6">
            <Eye className="h-4 w-4" /> {t.vocab.reveal}
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={i === 0}
          className="btn-solid btn-solid-outline disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> {t.vocab.prev}
        </button>
        <button
          onClick={next}
          disabled={i === words.length - 1}
          className="btn-solid btn-solid-primary disabled:opacity-40"
        >
          {t.vocab.next} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-foreground/40">{t.vocab.hint}</p>
    </div>
  );
}
