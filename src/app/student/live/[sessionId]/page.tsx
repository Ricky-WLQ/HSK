import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import { requireSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import LivePlayer from "@/components/LivePlayer";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function LivePlayerPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requireSession();
  const { sessionId } = await params;

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
        <Link href="/student/classes" className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.teacher.myClasses}
        </Link>
        <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
          <Radio className="h-7 w-7 text-primary" /> {t.live.title}
        </h1>
        <div className="mt-8">
          <LivePlayer sessionId={sessionId} />
        </div>
      </main>
    </div>
  );
}
