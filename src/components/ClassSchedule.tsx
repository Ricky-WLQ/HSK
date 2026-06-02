"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Plus, Users, Trash2, Video } from "lucide-react";
import LocalTime from "@/components/LocalTime";
import { t } from "@/i18n";

export type ScheduleRow = {
  id: string;
  title: string | null;
  startAt: string;
  endAt: string;
  durationMin: number;
  maxParticipants: number;
  booked: number;
  status: string;
};

export default function ClassSchedule({ classId, initial }: { classId: string; initial: ScheduleRow[] }) {
  const [rows, setRows] = useState<ScheduleRow[]>(initial);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [capacity, setCapacity] = useState(1);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!startAt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          title: title.trim() || undefined,
          startAt,
          durationMin,
          maxParticipants: capacity,
          recordingRequested: recording,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { sessionId?: string };
      if (!res.ok || !data.sessionId) {
        setError(t.auth.genericError);
        return;
      }
      const iso = new Date(startAt).toISOString();
      const endAt = new Date(new Date(startAt).getTime() + durationMin * 60_000).toISOString();
      setRows((p) =>
        [
          { id: data.sessionId!, title: title.trim() || null, startAt: iso, endAt, durationMin, maxParticipants: capacity, booked: 0, status: "scheduled" },
          ...p,
        ].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      );
      setTitle("");
      setStartAt("");
    } catch {
      setError(t.auth.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm(t.schedule.confirmCancel)) return;
    const prev = rows;
    setRows((r) => r.filter((s) => s.id !== id));
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) setRows(prev);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card-elevated space-y-4 p-6">
        <h2 className="font-heading flex items-center gap-2 text-lg font-bold">
          <Plus className="h-5 w-5 text-primary" /> {t.schedule.newSession}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-semibold" htmlFor="s-title">{t.schedule.sessionTitle}</label>
            <input id="s-title" className="input-clay" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="s-start">{t.schedule.startAt}</label>
            <input id="s-start" type="datetime-local" className="input-clay" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="s-dur">{t.schedule.duration}</label>
            <input id="s-dur" type="number" min={15} max={120} step={5} className="input-clay" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value) || 60)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="s-cap">{t.schedule.capacity}</label>
            <input id="s-cap" type="number" min={1} max={100} className="input-clay" value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 1)} />
            <span className="mt-1 block text-xs text-foreground/50">{t.schedule.oneOnOne}</span>
          </div>
          <label className="flex items-center gap-2 self-end text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5" checked={recording} onChange={(e) => setRecording(e.target.checked)} />
            {t.schedule.recording}
          </label>
        </div>
        {error && <p className="badge badge-error w-full justify-center py-2">{error}</p>}
        <button type="submit" disabled={busy || !startAt} className="btn-solid btn-solid-primary">
          {busy ? t.schedule.creating : t.schedule.create}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="card-flat px-5 py-6 text-center text-foreground/60">{t.schedule.none}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.id} className="card-flat flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold">
                  <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                  <LocalTime iso={s.startAt} />
                </div>
                <div className="text-sm text-foreground/50">
                  {s.title ? `${s.title} · ` : ""}
                  {s.durationMin} {t.schedule.min} · {s.maxParticipants === 1 ? "1:1" : `${t.schedule.capacity} ${s.maxParticipants}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge badge-primary flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {s.booked}/{s.maxParticipants}
                </span>
                <Link href={`/call/${s.id}`} className="btn-solid btn-solid-primary shrink-0">
                  <Video className="h-4 w-4" /> {t.schedule.join}
                </Link>
                <button type="button" onClick={() => cancel(s.id)} aria-label={t.schedule.cancelSession} className="btn-ghost h-9 w-9 p-0 text-error">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
