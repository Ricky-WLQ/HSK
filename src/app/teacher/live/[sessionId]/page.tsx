import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radio } from "lucide-react";
import { requireTeacher } from "@/lib/session";
import { computeLiveState } from "@/lib/live";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import LiveHost from "@/components/LiveHost";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function LiveHostPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await requireTeacher();
  const { sessionId } = await params;
  const state = await computeLiveState(sessionId, session.user.id);
  if (!state || !state.isTeacher) notFound();

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
        <Link href="/teacher" className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.teacher.dashboardTitle}
        </Link>
        <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
          <Radio className="h-7 w-7 text-primary" /> {state.title || t.live.title}
        </h1>
        <div className="mt-8">
          <LiveHost sessionId={sessionId} />
        </div>
      </main>
    </div>
  );
}
