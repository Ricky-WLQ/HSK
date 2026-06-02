import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getClassRole } from "@/lib/messages";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import StudentMessages from "@/components/StudentMessages";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function StudentClassMessagesPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await requireSession();
  const { classId } = await params;

  const role = await getClassRole(classId, session.user.id);
  if (!role.isStudent) notFound();
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
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
        <Link href="/student/classes" className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.teacher.myClasses}
        </Link>
        <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
          <MessagesSquare className="h-7 w-7 text-primary" /> {cls.name}
        </h1>
        <p className="mt-1 text-foreground/60">{t.messages.title}</p>

        <div className="mt-8">
          <StudentMessages classId={classId} selfId={session.user.id} />
        </div>
      </main>
    </div>
  );
}
