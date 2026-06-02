"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Volume2, Check } from "lucide-react";
import { t } from "@/i18n";
import { useAudioPlayer } from "@/lib/useAudioPlayer";
import type { VocabWord } from "@/lib/vocab";

const PAGE = 60;

export default function VocabBrowser({ words }: { words: VocabWord[] }) {
  const [q, setQ] = useState("");
  const [showPinyin, setShowPinyin] = useState(true);
  const [showDef, setShowDef] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [mastery, setMastery] = useState<Record<string, number>>({});
  // One shared audio player for all cards so only one clip plays at a time.
  const { play, loading, error: audioError } = useAudioPlayer();
  const [activeText, setActiveText] = useState<string | null>(null);
  const onPlay = useCallback(
    (text: string) => {
      setActiveText(text);
      void play(text);
    },
    [play],
  );

  const level = words[0]?.level;
  useEffect(() => {
    if (!level) return;
    fetch(`/api/vocab/progress?level=${encodeURIComponent(level)}`)
      .then((r) => (r.ok ? r.json() : { progress: {} }))
      .then((d) => setMastery(d.progress ?? {}))
      .catch(() => {});
  }, [level]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return words;
    return words.filter(
      (w) =>
        w.hanzi.includes(s) ||
        w.pinyin.toLowerCase().includes(s) ||
        w.readings.some((r) => r.toLowerCase().includes(s)) ||
        (w.definition?.toLowerCase().includes(s) ?? false),
    );
  }, [q, words]);

  const shown = filtered.slice(0, limit);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input-clay max-w-sm flex-1"
          placeholder={t.vocab.search}
          aria-label={t.vocab.search}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
        />
        <button
          aria-pressed={showPinyin}
          className={`chip ${showPinyin ? "chip-active" : ""}`}
          onClick={() => setShowPinyin((v) => !v)}
        >
          {t.vocab.showPinyin}
        </button>
        <button
          aria-pressed={showDef}
          className={`chip ${showDef ? "chip-active" : ""}`}
          onClick={() => setShowDef((v) => !v)}
        >
          {t.vocab.showDefinition}
        </button>
      </div>

      {audioError && (
        <p role="alert" className="mb-3 text-sm font-semibold text-error">
          {t.vocab.audioError}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-foreground/75">{t.vocab.noResults}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((w) => (
            <WordCard
              key={w.id}
              w={w}
              showPinyin={showPinyin}
              showDef={showDef}
              mastered={(mastery[w.id] ?? 0) >= 4}
              onPlay={onPlay}
              playing={loading && activeText === w.hanzi}
            />
          ))}
        </div>
      )}

      {limit < filtered.length && (
        <div className="mt-6 text-center">
          <button
            className="btn-solid btn-solid-outline"
            onClick={() => setLimit((l) => l + PAGE)}
          >
            {t.vocab.loadMore} ({(filtered.length - limit).toLocaleString()})
          </button>
        </div>
      )}
    </div>
  );
}

function WordCard({
  w,
  showPinyin,
  showDef,
  mastered,
  onPlay,
  playing,
}: {
  w: VocabWord;
  showPinyin: boolean;
  showDef: boolean;
  mastered: boolean;
  onPlay: (text: string) => void;
  playing: boolean;
}) {
  return (
    <div className="card-flat relative p-4">
      {mastered && (
        <span
          className="badge badge-success absolute right-2 top-2 gap-1"
          title={t.vocab.mastered}
        >
          <Check className="h-3 w-3" /> {t.vocab.mastered}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-heading text-2xl font-bold leading-tight">{w.hanzi}</div>
          {showPinyin && (
            <div className="text-sm font-semibold text-primary">
              {w.readings.join(" · ")}
            </div>
          )}
        </div>
        <PlayButton text={w.hanzi} onPlay={onPlay} playing={playing} />
      </div>
      {showDef &&
        (w.definition ? (
          <p className="mt-1 text-sm text-foreground/70">{w.definition}</p>
        ) : (
          <p className="mt-1 text-xs italic text-foreground/65">{t.vocab.definitionComing}</p>
        ))}
    </div>
  );
}

function PlayButton({
  text,
  onPlay,
  playing,
}: {
  text: string;
  onPlay: (text: string) => void;
  playing: boolean;
}) {
  return (
    <button
      onClick={() => onPlay(text)}
      disabled={playing}
      aria-label={t.vocab.play}
      title={t.vocab.play}
      className="icon-container h-11 w-11 shrink-0 text-primary disabled:opacity-50"
    >
      <Volume2 className={`h-4 w-4 ${playing ? "animate-pulse" : ""}`} />
    </button>
  );
}
