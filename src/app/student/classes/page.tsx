import Link from "next/link";
import { ArrowLeft, Users, GraduationCap, ClipboardList, CheckCircle2, ArrowRight, MessagesSquare, CalendarClock, Video } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getStudentClasses } from "@/lib/classes";
import { getStudentAssignments } from "@/lib/assignments";
import { studentUnread } from "@/lib/messages";
import { getStudentSessions } from "@/lib/scheduling";
import { levelLabel } from "@/lib/levels";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import JoinClassForm from "@/components/JoinClassForm";
import JoinLive from "@/components/JoinLive";
import BookButton from "@/components/BookButton";
import LocalTime from "@/components/LocalTime";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

type StudentClass = {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  teacher: { name: string };
  _count: { members: number };
};

export default async function StudentClassesPage() {
  const session = await requireSession();

  let classes: StudentClass[] = [];
  let assignments: Awaited<ReturnType<typeof getStudentAssignments>> = [];
  try {
    [classes, assignments] = await Promise.all([
      getStudentClasses(session.user.id) as Promise<StudentClass[]>,
      getStudentAssignments(session.user.id),
    ]);
  } catch {
    // best-effort: still render the join form
  }

  const statusBadge: Record<string, string> = {
    completed: "badge-success",
    overdue: "badge-error",
    not_started: "badge-info",
  };

  const unreadByClass: Record<string, number> = {};
  let liveSessions: Awaited<ReturnType<typeof getStudentSessions>> = [];
  try {
    const counts = await Promise.all(classes.map((c) => studentUnread(c.id, session.user.id)));
    classes.forEach((c, i) => {
      unreadByClass[c.id] = counts[i];
    });
    liveSessions = await getStudentSessions(session.user.id);
  } catch {
    // unread badges + sessions are best-effort
  }

  return (
    <div className="min-h-screen">
      <header className="nav-bar">
        <div className="container-app flex h-16 items-center justify-between">
          <Link href="/" className="font-heading text-xl font-extrabold text-gradient-hero">
            {t.app.name}
          </Link>
          <div className="flex items-center gap-2">
            <FontSizeControl />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="container-app py-12">
        <Link href="/dashboard" className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.nav.dashboard}
        </Link>
        <h1 className="font-heading text-3xl font-extrabold">{t.teacher.myClasses}</h1>
        <p className="mt-1 text-foreground/75">{t.teacher.myClassesDesc}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <JoinClassForm />
          <JoinLive />
        </div>

        {assignments.length > 0 && (
          <section className="mt-10">
            <h2 className="font-heading flex items-center gap-2 text-lg font-bold text-foreground/70">
              <ClipboardList className="h-5 w-5" /> {t.assignments.yourAssignments}
            </h2>
            <ul className="mt-3 space-y-2">
              {assignments.map((a) => (
                <li key={a.id} className="card-flat flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="badge badge-info shrink-0">{t.assignments.typeNames[a.type]}</span>
                      <span className="truncate">{a.title}</span>
                      <span className={`badge ${statusBadge[a.status]} shrink-0`}>
                        {t.assignments.statusNames[a.status]}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 text-sm text-foreground/70">
                      <span>{t.assignments.fromClass}: {a.className}</span>
                      <span>{t.assignments.dueLabel}: {a.dueDate ? <LocalTime iso={a.dueDate} dateOnly /> : t.assignments.noDue}</span>
                      {a.status === "completed" && a.score != null && (
                        <span className="font-semibold text-success">{t.assignments.score}: {a.score}%</span>
                      )}
                    </div>
                  </div>
                  <Link href={a.startUrl} className="btn-solid btn-solid-outline shrink-0">
                    {a.status === "completed" ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> {t.assignments.review}
                      </>
                    ) : (
                      <>
                        {t.assignments.start} <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {liveSessions.length > 0 && (
          <section className="mt-10">
            <h2 className="font-heading flex items-center gap-2 text-lg font-bold text-foreground/70">
              <CalendarClock className="h-5 w-5" /> {t.schedule.yourSessions}
            </h2>
            <ul className="mt-3 space-y-2">
              {liveSessions.map((s) => (
                <li key={s.id} className="card-flat flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                      <LocalTime iso={s.startAt} />
                    </div>
                    <div className="text-sm text-foreground/70">
                      {s.className}
                      {s.title ? ` · ${s.title}` : ""} · {s.durationMin} {t.schedule.min}
                      {s.maxParticipants > 1 ? ` · ${s.booked}/${s.maxParticipants} ${t.schedule.booked}` : " · 1:1"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {s.mine && (
                      <Link href={`/call/${s.id}`} className="btn-solid btn-solid-primary">
                        <Video className="h-4 w-4" /> {t.schedule.join}
                      </Link>
                    )}
                    <BookButton sessionId={s.id} mine={s.mine} full={!s.mine && s.booked >= s.maxParticipants} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {classes.length === 0 ? (
          <p className="card-flat mt-8 px-5 py-8 text-center text-foreground/75">{t.teacher.notEnrolled}</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {classes.map((c) => (
              <div key={c.id} className="card-flat flex flex-col gap-3 p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-heading text-xl font-extrabold">{c.name}</h3>
                  {levelLabel(c.level) && (
                    <span className="badge badge-primary shrink-0">{levelLabel(c.level)}</span>
                  )}
                </div>
                {c.description && <p className="text-sm text-foreground/75">{c.description}</p>}
                <div className="flex flex-wrap gap-4 text-sm text-foreground/75">
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4" /> {t.teacher.taughtBy}: {c.teacher.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> {c._count.members} {t.teacher.students}
                  </span>
                </div>
                <Link
                  href={`/student/classes/${c.id}/messages`}
                  className="btn-solid btn-solid-outline mt-1 self-start"
                >
                  <MessagesSquare className="h-4 w-4" /> {t.messages.open}
                  {unreadByClass[c.id] > 0 && (
                    <span className="badge badge-error ml-1" aria-label={`${unreadByClass[c.id]} ${t.messages.unread}`}>
                      {unreadByClass[c.id]}
                    </span>
                  )}
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
