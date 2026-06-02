"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { t } from "@/i18n";

type Msg = { id: string; body: string; authorId: string; authorName: string; mine: boolean; createdAt: string };

/** One message thread (announcements when studentId is null, else a 1:1 thread). */
export default function MessagePanel({
  classId,
  studentId,
  canPost,
  emptyText,
}: {
  classId: string;
  studentId: string | null;
  canPost: boolean;
  emptyText: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const url = studentId
    ? `/api/classes/${classId}/messages?studentId=${encodeURIComponent(studentId)}`
    : `/api/classes/${classId}/messages`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      const data = (await res.json().catch(() => ({}))) as { messages?: Msg[] };
      setMsgs(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // leave existing messages on transient error
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, studentId: studentId ?? undefined }),
      });
      if (res.ok) {
        setText("");
        await load();
      } else {
        setError(t.auth.genericError);
      }
    } catch {
      setError(t.auth.genericError);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card-flat flex flex-col p-0">
      <div className="max-h-96 min-h-40 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {loading ? (
          <p className="text-sm text-foreground/70">…</p>
        ) : msgs.length === 0 ? (
          <p className="text-sm text-foreground/70">{emptyText}</p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  m.mine ? "bg-primary text-white" : "bg-surface"
                }`}
              >
                {!m.mine && <div className="text-xs font-semibold opacity-70">{m.authorName}</div>}
                <div className="whitespace-pre-wrap break-words text-sm">{m.body}</div>
                <div className={`mt-0.5 text-xs ${m.mine ? "text-white/70" : "text-foreground/65"}`}>
                  {new Date(m.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      {canPost && (
        <div className="border-t border-card-border">
        <form onSubmit={send} className="flex items-end gap-2 p-3">
          <label htmlFor={`msg-${studentId ?? "ann"}`} className="sr-only">
            {t.messages.placeholder}
          </label>
          <textarea
            id={`msg-${studentId ?? "ann"}`}
            className="input-clay min-h-11 flex-1 resize-y"
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.messages.placeholder}
            maxLength={2000}
          />
          <button type="submit" disabled={sending || !text.trim()} className="btn-solid btn-solid-primary shrink-0">
            <Send className="h-4 w-4" /> {sending ? t.messages.sending : t.messages.send}
          </button>
        </form>
        {error && (
          <p role="alert" className="px-3 pb-3 text-sm font-semibold text-error">
            {error}
          </p>
        )}
        </div>
      )}
    </div>
  );
}
