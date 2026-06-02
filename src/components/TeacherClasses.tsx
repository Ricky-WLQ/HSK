"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Users, ClipboardList, ArrowRight } from "lucide-react";
import { CLASS_LEVELS, levelLabel } from "@/lib/levels";
import InviteCodeBadge from "@/components/InviteCodeBadge";
import { t } from "@/i18n";

export type ClassCard = {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  inviteCode: string;
  members: number;
  assignments: number;
};

export default function TeacherClasses({ initialClasses }: { initialClasses: ClassCard[] }) {
  const [classes, setClasses] = useState<ClassCard[]>(initialClasses);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined, level: level || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { classId?: string; inviteCode?: string };
      if (!res.ok || !data.classId || !data.inviteCode) {
        setError(t.auth.genericError);
        return;
      }
      setClasses((prev) => [
        {
          id: data.classId!,
          name: trimmed,
          description: description.trim() || null,
          level: level || null,
          inviteCode: data.inviteCode!,
          members: 0,
          assignments: 0,
        },
        ...prev,
      ]);
      setName("");
      setDescription("");
      setLevel("");
    } catch {
      setError(t.auth.genericError);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Create class */}
      <form onSubmit={handleCreate} className="card-elevated space-y-4 p-6">
        <h2 className="font-heading flex items-center gap-2 text-lg font-bold">
          <Plus className="h-5 w-5 text-primary" /> {t.teacher.createClass}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-semibold" htmlFor="class-name">
              {t.teacher.className}
            </label>
            <input
              id="class-name"
              className="input-clay"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.teacher.classNamePlaceholder}
              maxLength={60}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="class-level">
              {t.teacher.levelFocus}
            </label>
            <select
              id="class-level"
              className="input-clay"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">{t.teacher.anyLevel}</option>
              {CLASS_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {levelLabel(l)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="class-desc">
              {t.teacher.classDescription}
            </label>
            <input
              id="class-desc"
              className="input-clay"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
            />
          </div>
        </div>
        {error && <p className="badge badge-error w-full justify-center py-2">{error}</p>}
        <button type="submit" disabled={creating || !name.trim()} className="btn-solid btn-solid-primary">
          {creating ? t.teacher.creating : t.teacher.create}
        </button>
      </form>

      {/* Class list */}
      {classes.length === 0 ? (
        <p className="card-flat px-5 py-8 text-center text-foreground/60">{t.teacher.noClasses}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {classes.map((c) => (
            <div key={c.id} className="card-flat flex flex-col gap-3 p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading text-xl font-extrabold">{c.name}</h3>
                {levelLabel(c.level) && <span className="badge badge-primary shrink-0">{levelLabel(c.level)}</span>}
              </div>
              {c.description && <p className="text-sm text-foreground/60">{c.description}</p>}
              <div className="flex flex-wrap gap-4 text-sm text-foreground/60">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" /> {c.members} {t.teacher.students}
                </span>
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4" /> {c.assignments} {t.teacher.assignments}
                </span>
              </div>
              <InviteCodeBadge code={c.inviteCode} />
              <Link
                href={`/teacher/classes/${c.id}`}
                className="btn-solid btn-solid-outline group mt-1 self-start"
              >
                {t.teacher.open}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
