import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";

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
          <span className="font-heading text-xl font-extrabold text-gradient-hero">
            HSK Online
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="container-app py-16">
        <div className="card-elevated mx-auto max-w-xl p-8">
          <h1 className="font-heading mb-2 text-2xl font-extrabold">
            Welcome, {user.name || user.email} 👋
          </h1>
          <p className="mb-4 text-foreground/70">
            You are signed in. This is a placeholder dashboard for Phase 0.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge badge-primary">Email: {user.email}</span>
            <span
              className={`badge ${role === "teacher" ? "badge-secondary" : "badge-info"}`}
            >
              Role: {role}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
