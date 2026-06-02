import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { requireTeacher } from "@/lib/session";
import { getOwnedClass } from "@/lib/classes";
import { getClassSessions } from "@/lib/scheduling";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import ClassSchedule, { type ScheduleRow } from "@/components/ClassSchedule";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function ClassSchedulePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await requireTeacher();
  const { classId } = await params;
  const cls = await getOwnedClass(classId, session.user.id);
  if (!cls) notFound();
  const sessions = (await getClassSessions(classId, session.user.id)) ?? [];

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

      <main className="container-app max-w-2xl py-12">
        <Link href={`/teacher/classes/${classId}`} className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.messages.backToClass}
        </Link>
        <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
          <CalendarClock className="h-7 w-7 text-primary" /> {cls.name}
        </h1>
        <p className="mt-1 text-foreground/75">{t.schedule.subtitle}</p>
        <p className="mt-1 text-sm text-foreground/65">{t.schedule.videoSoon}</p>

        <div className="mt-8">
          <ClassSchedule classId={classId} initial={sessions as ScheduleRow[]} />
        </div>
      </main>
    </div>
  );
}
