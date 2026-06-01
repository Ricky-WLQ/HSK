import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, FileText, Languages, ArrowRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const { user } = session;
  const role = user.role ?? "student";

  let mastered = 0;
  let practiceDone = 0;
  try {
    [mastered, practiceDone] = await Promise.all([
      prisma.vocabProgress.count({ where: { userId: user.id, mastery: { gte: 4 } } }),
      prisma.hskAttempt.count({ where: { userId: user.id, status: "completed" } }),
    ]);
  } catch {
    // stats are best-effort
  }

  return (
    <div className="min-h-screen">
      <header className="nav-bar">
        <div className="container-app flex h-16 items-center justify-between">
          <Link href="/" className="font-heading text-xl font-extrabold text-gradient-hero">
            {t.app.name}
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="container-app py-12">
        <h1 className="font-heading text-3xl font-extrabold">
          {t.dashboard.welcome}, {user.name || user.email} 👋
        </h1>
        <p className="mt-1 text-foreground/60">{t.dashboard.subtitle}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="card-flat px-5 py-3">
            <div className="text-2xl font-extrabold text-primary">{mastered.toLocaleString()}</div>
            <div className="text-xs text-foreground/60">{t.dashboard.masteredWords}</div>
          </div>
          <div className="card-flat px-5 py-3">
            <div className="text-2xl font-extrabold text-secondary">{practiceDone.toLocaleString()}</div>
            <div className="text-xs text-foreground/60">{t.dashboard.practiceDone}</div>
          </div>
        </div>

        <h2 className="mt-10 font-heading text-lg font-bold text-foreground/70">
          {t.dashboard.continueLearning}
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Link href="/vocab" className="card-interactive group flex items-start gap-4 p-6">
            <span className="icon-container h-11 w-11 shrink-0 text-primary">
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-heading text-xl font-extrabold">
                {t.dashboard.vocabTitle}
                <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
              </div>
              <p className="mt-1 text-sm text-foreground/60">{t.dashboard.vocabDesc}</p>
            </div>
          </Link>

          <Link href="/grammar" className="card-interactive group flex items-start gap-4 p-6">
            <span className="icon-container h-11 w-11 shrink-0 text-primary">
              <Languages className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-heading text-xl font-extrabold">
                {t.dashboard.grammarTitle}
                <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
              </div>
              <p className="mt-1 text-sm text-foreground/60">{t.dashboard.grammarDesc}</p>
            </div>
          </Link>

          <Link href="/practice" className="card-interactive group flex items-start gap-4 p-6">
            <span className="icon-container h-11 w-11 shrink-0 text-secondary">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1 font-heading text-xl font-extrabold">
                {t.dashboard.practiceTitle}
                <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
              </div>
              <p className="mt-1 text-sm text-foreground/60">{t.dashboard.practiceDesc}</p>
            </div>
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap gap-2 text-sm">
          <span className="badge badge-primary">
            {t.dashboard.emailLabel}: {user.email}
          </span>
          <span className={`badge ${role === "teacher" ? "badge-secondary" : "badge-info"}`}>
            {t.dashboard.roleLabel}: {role}
          </span>
        </div>
      </main>
    </div>
  );
}
