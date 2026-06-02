import Link from "next/link";
import { ArrowLeft, Video } from "lucide-react";
import { requireSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import VideoCall from "@/components/VideoCall";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function CallPage({
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

      <main className="container-app py-8">
        <Link href="/dashboard" className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.call.back}
        </Link>
        <h1 className="font-heading mb-4 flex items-center gap-2 text-2xl font-extrabold">
          <Video className="h-6 w-6 text-primary" /> {t.call.title}
        </h1>
        <VideoCall sessionId={sessionId} />
      </main>
    </div>
  );
}
