import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { getSession } from "@/lib/session";
import { t } from "@/i18n";

export default async function Home() {
  const session = await getSession();
  const signedIn = !!session;
  const primaryHref = signedIn ? "/dashboard" : "/login";

  return (
    <div className="min-h-screen hero-section">
      <header className="nav-bar">
        <div className="container-app flex h-16 items-center justify-between">
          <Link href="/" className="font-heading text-xl font-extrabold text-gradient-hero">
            {t.app.name}
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href={primaryHref} className="btn-solid btn-solid-primary">
              {signedIn ? t.nav.dashboard : t.nav.signIn}
            </Link>
          </div>
        </div>
      </header>

      <main className="container-app py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge badge-primary mb-4">{t.home.badge}</span>
          <h1 className="font-heading mb-4 text-4xl font-extrabold leading-tight sm:text-5xl">
            {t.home.titleLead}{" "}
            <span className="text-gradient-primary">{t.home.titleHighlight}</span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-lg text-foreground/70">
            {t.home.subtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={primaryHref} className="btn-solid btn-solid-primary">
              {signedIn ? t.home.goToDashboard : t.home.getStarted}
            </Link>
            <Link href={primaryHref} className="btn-solid btn-solid-outline">
              {t.home.exploreLevels}
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <div className="card-elevated card-header-vocab p-6 animate-card-enter">
            <h3 className="font-heading mb-1 text-lg font-bold">{t.home.features.vocab.title}</h3>
            <p className="text-sm text-foreground/70">{t.home.features.vocab.body}</p>
          </div>
          <div className="card-elevated card-header-listening p-6 animate-card-enter delay-100">
            <h3 className="font-heading mb-1 text-lg font-bold">{t.home.features.practice.title}</h3>
            <p className="text-sm text-foreground/70">{t.home.features.practice.body}</p>
          </div>
          <div className="card-elevated card-header-writing p-6 animate-card-enter delay-200">
            <h3 className="font-heading mb-1 text-lg font-bold">{t.home.features.live.title}</h3>
            <p className="text-sm text-foreground/70">{t.home.features.live.body}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
