"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Trash2, BarChart3 } from "lucide-react";
import { CLASS_LEVELS, levelLabel } from "@/lib/levels";
import { t } from "@/i18n";

type AssignmentType = "practice" | "grammar" | "mock" | "diagnostic";
const TYPES: AssignmentType[] = ["practice", "grammar", "mock", "diagnostic"];
const SECTIONS = ["reading", "listening", "writing", "translation"] as const;

export type SetMeta = { id: string; level: string; section: string; title: string; questionCount: number };
export type AssignmentRow = {
  id: string;
  type: AssignmentType;
  title: string;
  dueDate: string | null;
  completed: number;
  total: number;
};

const sectionLabel: Record<string, string> = {
  reading: t.practice.reading,
  listening: t.practice.listening,
  writing: t.practice.writing,
  translation: t.practice.translation,
};

export default function ClassAssignments({
  classId,
  memberCount,
  initialAssignments,
  practiceSets,
}: {
  classId: string;
  memberCount: number;
  initialAssignments: AssignmentRow[];
  practiceSets: SetMeta[];
}) {
  const [rows, setRows] = useState<AssignmentRow[]>(initialAssignments);
  const [type, setType] = useState<AssignmentType>("practice");
  const [level, setLevel] = useState("1");
  const [section, setSection] = useState<string>("reading");
  const [setId, setSetId] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setsForChoice = useMemo(
    () => practiceSets.filter((s) => s.level === level && s.section === section),
    [practiceSets, level, section],
  );

  const needsSet = type === "practice";
  const canSubmit = !busy && (!needsSet || (setId && setsForChoice.some((s) => s.id === setId)));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          type,
          level,
          section: needsSet ? section : undefined,
          setId: needsSet ? setId : undefined,
          title: title.trim() || undefined,
          dueDate: due || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { assignmentId?: string };
      if (!res.ok || !data.assignmentId) {
        setError(t.auth.genericError);
        return;
      }
      const displayTitle =
        title.trim() ||
        `${levelLabel(level)} ${type === "practice" ? `${sectionLabel[section]} ${t.assignments.typeNames.practice}` : t.assignments.typeNames[type]}`;
      setRows((prev) => [
        { id: data.assignmentId!, type, title: displayTitle, dueDate: due || null, completed: 0, total: memberCount },
        ...prev,
      ]);
      setTitle("");
      setDue("");
      setSetId("");
    } catch {
      setError(t.auth.genericError);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.assignments.confirmDelete)) return;
    const prev = rows;
    setRows((r) => r.filter((a) => a.id !== id)); // optimistic
    const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    if (!res.ok) setRows(prev); // revert on failure
  }

  return (
    <section className="mt-10">
      <h2 className="font-heading flex items-center gap-2 text-lg font-bold text-foreground/70">
        <ClipboardList className="h-5 w-5" /> {t.assignments.heading}
      </h2>

      {/* Create */}
      <form onSubmit={handleCreate} className="card-elevated mt-3 space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="a-type">{t.assignments.type}</label>
            <select id="a-type" className="input-clay" value={type} onChange={(e) => setType(e.target.value as AssignmentType)}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>{t.assignments.typeNames[ty]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="a-level">{t.assignments.level}</label>
            <select id="a-level" className="input-clay" value={level} onChange={(e) => setLevel(e.target.value)}>
              {CLASS_LEVELS.map((l) => (
                <option key={l} value={l}>{levelLabel(l)}</option>
              ))}
            </select>
          </div>
          {needsSet && (
            <>
              <div>
                <label className="mb-1 block text-sm font-semibold" htmlFor="a-section">{t.assignments.section}</label>
                <select id="a-section" className="input-clay" value={section} onChange={(e) => { setSection(e.target.value); setSetId(""); }}>
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>{sectionLabel[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold" htmlFor="a-set">{t.assignments.set}</label>
                <select id="a-set" className="input-clay" value={setId} onChange={(e) => setSetId(e.target.value)}>
                  <option value="">{t.assignments.chooseSet}</option>
                  {setsForChoice.map((s) => (
                    <option key={s.id} value={s.id}>{s.title} · {s.questionCount}Q</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="a-title">{t.assignments.titleLabel}</label>
            <input id="a-title" className="input-clay" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t.assignments.titlePlaceholder} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="a-due">{t.assignments.due}</label>
            <input id="a-due" type="datetime-local" className="input-clay" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        {needsSet && setsForChoice.length === 0 && (
          <p className="text-sm text-foreground/70">{t.assignments.noSets}</p>
        )}
        {error && <p className="badge badge-error w-full justify-center py-2">{error}</p>}
        <button type="submit" disabled={!canSubmit} className="btn-solid btn-solid-primary">
          <Plus className="h-4 w-4" /> {busy ? t.assignments.assigning : t.assignments.assign}
        </button>
      </form>

      {/* List */}
      {rows.length === 0 ? (
        <p className="card-flat mt-4 px-5 py-6 text-center text-foreground/75">{t.assignments.none}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="card-flat flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold">
                  <span className="badge badge-info shrink-0">{t.assignments.typeNames[a.type]}</span>
                  <span className="truncate">{a.title}</span>
                </div>
                {a.dueDate && (
                  <div className="text-sm text-foreground/70">
                    {t.assignments.dueLabel}: {new Date(a.dueDate).toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="badge badge-primary">{a.completed}/{a.total} {t.assignments.completed}</span>
                <Link
                  href={`/teacher/classes/${classId}/assignments/${a.id}`}
                  className="btn-ghost flex h-9 items-center gap-1.5 px-3 text-sm"
                >
                  <BarChart3 className="h-4 w-4" /> {t.assignments.details}
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  aria-label={t.assignments.delete}
                  className="btn-ghost flex h-11 w-11 items-center justify-center p-0 text-error"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
