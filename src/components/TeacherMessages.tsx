"use client";

import { useState } from "react";
import { Megaphone, MessagesSquare } from "lucide-react";
import MessagePanel from "@/components/MessagePanel";
import { t } from "@/i18n";

type Student = { id: string; name: string; email: string; unread: number };

export default function TeacherMessages({ classId, students }: { classId: string; students: Student[] }) {
  const [activeId, setActiveId] = useState<string | null>(students[0]?.id ?? null);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-heading mb-3 flex items-center gap-2 text-lg font-bold text-foreground/70">
          <Megaphone className="h-5 w-5" /> {t.messages.announcements}
        </h2>
        <MessagePanel classId={classId} studentId={null} canPost emptyText={t.messages.noAnnouncements} />
      </section>

      <section>
        <h2 className="font-heading mb-3 flex items-center gap-2 text-lg font-bold text-foreground/70">
          <MessagesSquare className="h-5 w-5" /> {t.messages.directMessages}
        </h2>
        {students.length === 0 ? (
          <p className="card-flat px-5 py-6 text-center text-foreground/75">{t.messages.noStudents}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <ul className="space-y-1">
              {students.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${
                      activeId === s.id ? "bg-surface font-semibold" : "hover:bg-surface"
                    }`}
                  >
                    <span className="truncate">{s.name || s.email}</span>
                    {s.unread > 0 && <span className="badge badge-error shrink-0">{s.unread}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {activeId && (
              <MessagePanel key={activeId} classId={classId} studentId={activeId} canPost emptyText={t.messages.noMessages} />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
