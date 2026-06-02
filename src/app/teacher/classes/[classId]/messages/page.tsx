import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { requireTeacher } from "@/lib/session";
import { getClassWithRoster } from "@/lib/classes";
import { teacherThreadUnread } from "@/lib/messages";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import TeacherMessages from "@/components/TeacherMessages";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function TeacherClassMessagesPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await requireTeacher();
  const { classId } = await params;

  const cls = await getClassWithRoster(classId, session.user.id);
  if (!cls) notFound();
  const unread = await teacherThreadUnread(classId, session.user.id);

  const students = cls.members.map((m) => ({
    id: m.student.id,
    name: m.student.name,
    email: m.student.email,
    unread: unread[m.student.id] ?? 0,
  }));

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
        <Link href={`/teacher/classes/${classId}`} className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.messages.backToClass}
        </Link>
        <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
          <MessagesSquare className="h-7 w-7 text-primary" /> {cls.name}
        </h1>
        <p className="mt-1 text-foreground/60">{t.messages.title}</p>

        <div className="mt-8">
          <TeacherMessages classId={classId} students={students} />
        </div>
      </main>
    </div>
  );
}
