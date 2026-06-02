import Link from "next/link";
import { GraduationCap, ArrowLeft } from "lucide-react";
import { requireTeacher } from "@/lib/session";
import { getTeacherClasses } from "@/lib/classes";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import TeacherClasses, { type ClassCard } from "@/components/TeacherClasses";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  const session = await requireTeacher();

  let initialClasses: ClassCard[] = [];
  try {
    const rows = await getTeacherClasses(session.user.id);
    initialClasses = rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      level: c.level,
      inviteCode: c.inviteCode,
      members: c._count.members,
      assignments: c._count.assignments,
    }));
  } catch {
    // best-effort: render the create form even if the list fails to load
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
        <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
          <span className="icon-container h-11 w-11 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          {t.teacher.dashboardTitle}
        </h1>
        <p className="mt-1 text-foreground/60">{t.teacher.dashboardSubtitle}</p>

        <div className="mt-8">
          <TeacherClasses initialClasses={initialClasses} />
        </div>
      </main>
    </div>
  );
}
