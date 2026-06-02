import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";
import { requireTeacher } from "@/lib/session";
import { getOwnedClass } from "@/lib/classes";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import QuizComposer from "@/components/QuizComposer";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function NewLiveQuizPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const session = await requireTeacher();
  const { classId } = await params;
  const cls = await getOwnedClass(classId, session.user.id);
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

      <main className="container-app max-w-2xl py-12">
        <Link href={`/teacher/classes/${classId}`} className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.messages.backToClass}
        </Link>
        <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
          <Radio className="h-7 w-7 text-primary" /> {t.live.create}
        </h1>
        <p className="mt-1 text-foreground/60">{t.live.composerHint}</p>
        <div className="mt-8">
          <QuizComposer classId={classId} />
        </div>
      </main>
    </div>
  );
}
