"use client";

import { t } from "@/i18n";
import type { HskGroup, HskQuestion } from "@/lib/exam";

export function AudioClip({ clipKey }: { clipKey: string }) {
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

/**
 * Presentational renderer for ONE exam question (no feedback — answers are
 * graded at the end of the exam). Group-level context (passage, shared bank,
 * group audio) is rendered by the caller; this handles the per-question stem
 * and the answer affordance for every HSK question type.
 */
export default function QuestionView({
  group,
  question: q,
  index,
  answer,
  onAnswer,
  showPinyin,
  disabled,
}: {
  group: HskGroup;
  question: HskQuestion;
  index: number;
  answer: string;
  onAnswer: (v: string) => void;
  showPinyin: boolean;
  disabled: boolean;
}) {
  const sel = answer ?? "";
  const radioCls = (active: boolean) =>
    active ? "border-primary bg-primary-lighter" : "card-interactive";

  const isWriting =
    q.type === "writing-sentence" ||
    q.type === "writing-essay" ||
    q.type === "translation-passage";

  return (
    <div className="border-t border-card-border pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex gap-2">
        <span className="font-semibold text-foreground/50">{index}.</span>
        <div className="flex-1">
          {q.prompt && <div className="leading-relaxed">{q.prompt}</div>}
          {showPinyin && q.pinyin && <div className="text-xs text-primary/80">{q.pinyin}</div>}
          {q.sourceText && (
            <div className="mt-1 rounded-lg bg-surface p-3 text-sm leading-relaxed">{q.sourceText}</div>
          )}
        </div>
      </div>

      {/* Per-item audio (independent listening items, HSK1–3). */}
      {q.audio && !group.audio && <AudioClip clipKey={q.audio.key} />}

      {/* Writing essay 4-panel images / writing-sentence single picture. */}
      {q.images && q.images.length > 0 && (
        <div className="my-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {q.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`${t.practice.picture} ${i + 1}`} className="rounded-lg border border-card-border object-cover" />
          ))}
        </div>
      )}
      {q.imageUrl && (
        <div className="my-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={q.imageUrl} alt={t.practice.picture} className="max-h-56 rounded-xl border border-card-border object-contain" />
        </div>
      )}
      {q.givenWord && (
        <div className="my-2 text-sm">
          <span className="text-foreground/50">{t.practice.givenWord}: </span>
          <span className="font-bold text-primary">{q.givenWord}</span>
        </div>
      )}

      {/* Answer affordance by type. */}
      {isWriting ? (
        <textarea
          className="input-clay mt-2 h-32 w-full resize-y"
          placeholder={t.practice.writeHere}
          disabled={disabled}
          value={sel}
          onChange={(e) => onAnswer(e.target.value)}
        />
      ) : q.type === "short-answer" || q.type === "listening-dictation" || q.type === "writing-fill-char" ? (
        <input
          className="input-clay mt-2 w-full"
          placeholder={t.practice.typePrompt}
          disabled={disabled}
          value={sel}
          onChange={(e) => onAnswer(e.target.value)}
        />
      ) : q.type === "listening-picture-true-false" || q.type === "listening-statement-true-false" ? (
        <div className="mt-2 flex gap-2" role="radiogroup">
          {TF.map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={sel === v}
              disabled={disabled}
              onClick={() => onAnswer(v)}
              className={`h-11 w-20 rounded-xl border-2 text-lg font-bold ${radioCls(sel === v)}`}
            >
              {v}
            </button>
          ))}
        </div>
      ) : group.sharedBank && !q.options ? (
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
          {group.sharedBank.map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={sel === o.label}
              aria-label={`${o.label}: ${o.text ?? t.practice.picture}`}
              disabled={disabled}
              onClick={() => onAnswer(o.label)}
              className={`h-9 w-9 rounded-lg border-2 font-bold ${sel === o.label ? "border-primary bg-primary-lighter" : ""}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2 grid gap-2" role="radiogroup">
          {(q.options ?? []).map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={sel === o.label}
              disabled={disabled}
              onClick={() => onAnswer(o.label)}
              className={`flex items-start gap-2 rounded-xl border-2 p-3 text-left ${radioCls(sel === o.label)}`}
            >
              <span className="font-bold text-primary">{o.label}</span>
              <span>
                {o.text}
                {showPinyin && o.pinyin && <span className="ml-1 text-xs text-primary/70">{o.pinyin}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
