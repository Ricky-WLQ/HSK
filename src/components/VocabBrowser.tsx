"use client";

import { useEffect, useMemo, useState } from "react";
import { Volume2, Check } from "lucide-react";
import { t } from "@/i18n";
import type { VocabWord } from "@/lib/vocab";

const PAGE = 60;

export default function VocabBrowser({ words }: { words: VocabWord[] }) {
  const [q, setQ] = useState("");
  const [showPinyin, setShowPinyin] = useState(true);
  const [showDef, setShowDef] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [mastery, setMastery] = useState<Record<string, number>>({});

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
        w.hanzi.includes(q) ||
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
          className="input-clay max-w-sm flex-1"
          placeholder={t.vocab.search}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
        />
        <button
          className={`chip ${showPinyin ? "chip-active" : ""}`}
          onClick={() => setShowPinyin((v) => !v)}
        >
          {t.vocab.showPinyin}
        </button>
        <button
          className={`chip ${showDef ? "chip-active" : ""}`}
          onClick={() => setShowDef((v) => !v)}
        >
          {t.vocab.showDefinition}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-foreground/60">{t.vocab.noResults}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((w) => (
            <WordCard
              key={w.id}
              w={w}
              showPinyin={showPinyin}
              showDef={showDef}
              mastered={(mastery[w.id] ?? 0) >= 4}
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
}: {
  w: VocabWord;
  showPinyin: boolean;
  showDef: boolean;
  mastered: boolean;
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
        <PlayButton text={w.hanzi} />
      </div>
      {showDef &&
        (w.definition ? (
          <p className="mt-1 text-sm text-foreground/70">{w.definition}</p>
        ) : (
          <p className="mt-1 text-xs italic text-foreground/40">{t.vocab.definitionComing}</p>
        ))}
    </div>
  );
}

function PlayButton({ text }: { text: string }) {
  const [loading, setLoading] = useState(false);
  async function play() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      onClick={play}
      disabled={loading}
      aria-label={t.vocab.play}
      title={t.vocab.play}
      className="icon-container h-9 w-9 shrink-0 text-primary disabled:opacity-50"
    >
      <Volume2 className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
    </button>
  );
}
