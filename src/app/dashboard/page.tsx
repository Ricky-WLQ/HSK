import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import { t } from "@/i18n";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { user } = session;
  const role = (user as { role?: string }).role ?? "student";

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

      <main className="container-app py-16">
        <div className="card-elevated mx-auto max-w-xl p-8">
          <h1 className="font-heading mb-2 text-2xl font-extrabold">
            {t.dashboard.welcome}, {user.name || user.email} 👋
          </h1>
          <p className="mb-4 text-foreground/70">{t.dashboard.placeholder}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge badge-primary">
              {t.dashboard.emailLabel}: {user.email}
            </span>
            <span
              className={`badge ${role === "teacher" ? "badge-secondary" : "badge-info"}`}
            >
              {t.dashboard.roleLabel}: {role}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
