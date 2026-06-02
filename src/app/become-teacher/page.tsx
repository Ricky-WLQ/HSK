import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import ClaimTeacherForm from "@/components/ClaimTeacherForm";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function BecomeTeacherPage() {
  const session = await requireSession();
  const role = session.user.role;
  if (role === "teacher" || role === "admin") redirect("/teacher");

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

      <main className="container-app max-w-xl py-12">
        <Link href="/dashboard" className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.nav.dashboard}
        </Link>
        <ClaimTeacherForm />
      </main>
    </div>
  );
}
