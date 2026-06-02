"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Volume2, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { t } from "@/i18n";
import { useAudioPlayer } from "@/lib/useAudioPlayer";
import type { VocabWord } from "@/lib/vocab";

export default function Flashcards({
  words,
  level,
}: {
  words: VocabWord[];
  level: string;
}) {
  const [i, setI] = useState(0);
  // Track which card index is revealed (derived, so changing cards auto-hides the
  // answer without a reset-in-effect).
  const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
  const revealed = revealedIndex === i;
  // Browsers block audio.play() until the user has interacted with the page, so
  // we don't auto-play the first card on mount — only after a gesture.
  const [gestured, setGestured] = useState(false);
  const { play } = useAudioPlayer();
  const w = words[i];

  const speak = useCallback(
    (text: string) => {
      setGestured(true);
      void play(text);
    },
    [play],
  );

  const next = useCallback(() => {
    setGestured(true);
    setI((x) => Math.min(x + 1, words.length - 1));
  }, [words.length]);
  const prev = useCallback(() => {
    setGestured(true);
    setI((x) => Math.max(x - 1, 0));
  }, []);

  // Listen-and-follow: auto-play when the card changes, once a gesture has unlocked audio.
  useEffect(() => {
    if (gestured && w) void play(w.hanzi);
  }, [i, gestured, w, play]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setRevealedIndex((cur) => (cur === i ? null : i));
      } else if (e.key.toLowerCase() === "r" && w) {
        speak(w.hanzi);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w, speak, next, prev, i]);

  if (!w) return null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between text-sm text-foreground/75">
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
          onClick={() => speak(w.hanzi)}
          className="btn-solid btn-solid-outline mx-auto mt-5"
        >
          <Volume2 className="h-4 w-4" /> {t.vocab.play}
        </button>

        <div className="mt-6" aria-live="polite">
          {revealed ? (
            <div className="animate-scale-in">
              <div className="text-xl font-semibold text-primary">
                {w.readings.join(" · ")}
              </div>
              {w.definition && <p className="mt-1 text-foreground/80">{w.definition}</p>}
              {w.examples?.[0] && (
                <div className="mt-4 rounded-xl bg-surface p-3 text-left text-sm">
                  <div className="font-medium">{w.examples[0].hanzi}</div>
                  <div className="text-primary">{w.examples[0].pinyin}</div>
                  <div className="text-foreground/75">{w.examples[0].english}</div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setRevealedIndex(i)} className="btn-ghost">
              <Eye className="h-4 w-4" /> {t.vocab.reveal}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={i === 0}
          aria-label={t.vocab.prev}
          className="btn-solid btn-solid-outline disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> {t.vocab.prev}
        </button>
        <button
          onClick={next}
          disabled={i === words.length - 1}
          aria-label={t.vocab.next}
          className="btn-solid btn-solid-primary disabled:opacity-40"
        >
          {t.vocab.next} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-3 text-center text-sm text-foreground/65">{t.vocab.hint}</p>
    </div>
  );
}
