import Link from "next/link";
import { ArrowLeft, Users, GraduationCap } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getStudentClasses } from "@/lib/classes";
import { levelLabel } from "@/lib/levels";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import JoinClassForm from "@/components/JoinClassForm";
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
  try {
    classes = (await getStudentClasses(session.user.id)) as StudentClass[];
  } catch {
    // best-effort: still render the join form
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
        <p className="mt-1 text-foreground/60">{t.teacher.myClassesDesc}</p>

        <div className="mt-8">
          <JoinClassForm />
        </div>

        {classes.length === 0 ? (
          <p className="card-flat mt-8 px-5 py-8 text-center text-foreground/60">{t.teacher.notEnrolled}</p>
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
                {c.description && <p className="text-sm text-foreground/60">{c.description}</p>}
                <div className="flex flex-wrap gap-4 text-sm text-foreground/60">
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4" /> {t.teacher.taughtBy}: {c.teacher.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> {c._count.members} {t.teacher.students}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
