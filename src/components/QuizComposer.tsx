"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check } from "lucide-react";
import { t } from "@/i18n";

type Q = { q: string; pinyin: string; options: string[]; correct: number };
const blank = (): Q => ({ q: "", pinyin: "", options: ["", ""], correct: 0 });

export default function QuizComposer({ classId }: { classId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [qs, setQs] = useState<Q[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Q>) =>
    setQs((p) => p.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const setOption = (i: number, oi: number, val: string) =>
    setQs((p) => p.map((q, j) => (j === i ? { ...q, options: q.options.map((o, k) => (k === oi ? val : o)) } : q)));
  const addOption = (i: number) =>
    setQs((p) => p.map((q, j) => (j === i && q.options.length < 6 ? { ...q, options: [...q.options, ""] } : q)));
  const removeOption = (i: number, oi: number) =>
    setQs((p) =>
      p.map((q, j) => {
        if (j !== i || q.options.length <= 2) return q;
        const options = q.options.filter((_, k) => k !== oi);
        return { ...q, options, correct: q.correct >= options.length ? options.length - 1 : q.correct };
      }),
    );
  const addQuestion = () => setQs((p) => [...p, blank()]);
  const removeQuestion = (i: number) => setQs((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p));

  const valid = qs.every(
    (q) => q.q.trim() && q.options.length >= 2 && q.options.every((o) => o.trim()) && q.correct < q.options.length,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(t.live.needQuestions);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          title: title.trim() || undefined,
          questions: qs.map((q) => ({
            q: q.q.trim(),
            pinyin: q.pinyin.trim() || undefined,
            options: q.options.map((o) => o.trim()),
            correct: q.correct,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { sessionId?: string };
      if (!res.ok || !data.sessionId) {
        setError(t.live.needQuestions);
        return;
      }
      router.push(`/teacher/live/${data.sessionId}`);
    } catch {
      setError(t.live.needQuestions);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="quiz-title">
          {t.live.quizTitle}
        </label>
        <input id="quiz-title" className="input-clay" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </div>

      {qs.map((q, i) => (
        <div key={i} className="card-flat space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold">
              {t.live.question} {i + 1}
            </h3>
            {qs.length > 1 && (
              <button type="button" onClick={() => removeQuestion(i)} aria-label={t.live.removeQuestion} className="btn-ghost h-8 w-8 p-0 text-error">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <input className="input-clay" placeholder={t.live.questionText} value={q.q} onChange={(e) => update(i, { q: e.target.value })} maxLength={300} />
          <input className="input-clay" placeholder={t.live.pinyinOptional} value={q.pinyin} onChange={(e) => update(i, { pinyin: e.target.value })} maxLength={300} />
          <div className="space-y-2">
            {q.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update(i, { correct: oi })}
                  aria-label={t.live.correctAnswer}
                  aria-pressed={q.correct === oi}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                    q.correct === oi ? "border-success bg-success text-white" : "border-card-border"
                  }`}
                >
                  <Check className="h-4 w-4" />
                </button>
                <input
                  className="input-clay flex-1"
                  placeholder={`${t.live.option} ${oi + 1}`}
                  value={o}
                  onChange={(e) => setOption(i, oi, e.target.value)}
                  maxLength={200}
                />
                {q.options.length > 2 && (
                  <button type="button" onClick={() => removeOption(i, oi)} aria-label={t.live.removeQuestion} className="btn-ghost h-9 w-9 p-0 text-foreground/40">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {q.options.length < 6 && (
              <button type="button" onClick={() => addOption(i)} className="btn-ghost text-sm">
                <Plus className="h-4 w-4" /> {t.live.addOption}
              </button>
            )}
          </div>
        </div>
      ))}

      <button type="button" onClick={addQuestion} className="btn-solid btn-solid-outline">
        <Plus className="h-4 w-4" /> {t.live.addQuestion}
      </button>

      {error && <p className="badge badge-error w-full justify-center py-2">{error}</p>}
      <button type="submit" disabled={busy} className="btn-solid btn-solid-primary w-full sm:w-auto">
        <Check className="h-4 w-4" /> {busy ? t.live.creating : t.live.startQuiz}
      </button>
    </form>
  );
}
