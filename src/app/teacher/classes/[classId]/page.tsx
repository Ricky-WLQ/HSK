import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, ClipboardList } from "lucide-react";
import { requireTeacher } from "@/lib/session";
import { getClassWithRoster } from "@/lib/classes";
import { levelLabel } from "@/lib/levels";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import InviteCodeBadge from "@/components/InviteCodeBadge";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function ClassRosterPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await requireTeacher();
  const { classId } = await params;

  const cls = await getClassWithRoster(classId, session.user.id);
  if (!cls) notFound();

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
        <Link href="/teacher" className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.teacher.backToClasses}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-3xl font-extrabold">{cls.name}</h1>
            {cls.description && <p className="mt-1 text-foreground/60">{cls.description}</p>}
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-foreground/60">
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {cls.members.length} {t.teacher.students}
              </span>
              <span className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" /> {cls._count.assignments} {t.teacher.assignments}
              </span>
            </div>
          </div>
          {levelLabel(cls.level) && <span className="badge badge-primary">{levelLabel(cls.level)}</span>}
        </div>

        <div className="card-flat mt-6 p-5">
          <InviteCodeBadge code={cls.inviteCode} />
        </div>

        <h2 className="font-heading mt-10 text-lg font-bold text-foreground/70">{t.teacher.roster}</h2>
        {cls.members.length === 0 ? (
          <p className="card-flat mt-3 px-5 py-8 text-center text-foreground/60">{t.teacher.noStudents}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {cls.members.map((m) => (
              <li key={m.id} className="card-flat flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <div className="font-semibold">{m.student.name || m.student.email}</div>
                  <div className="truncate text-sm text-foreground/50">{m.student.email}</div>
                </div>
                <span className="text-sm text-foreground/50">
                  {t.teacher.joined} {new Date(m.joinedAt).toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
