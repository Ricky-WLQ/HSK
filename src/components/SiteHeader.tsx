import Link from "next/link";
import { getSession } from "@/lib/session";
import ThemeToggle from "@/components/ThemeToggle";
import { t } from "@/i18n";

export default async function SiteHeader() {
  const session = await getSession();
  const signedIn = !!session;
  return (
    <header className="nav-bar">
      <div className="container-app flex h-16 items-center justify-between">
        <Link href="/" className="font-heading text-xl font-extrabold text-gradient-hero">
          {t.app.name}
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/vocab" className="btn-ghost hidden sm:inline-flex">
            {t.vocab.title}
          </Link>
          <ThemeToggle />
          <Link
            href={signedIn ? "/dashboard" : "/login"}
            className="btn-solid btn-solid-primary"
          >
            {signedIn ? t.nav.dashboard : t.nav.signIn}
          </Link>
        </nav>
      </div>
    </header>
  );
}
