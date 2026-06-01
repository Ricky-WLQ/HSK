import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { HSK_LEVELS, levelBand } from "@/lib/vocab";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function DiagnosticHub() {
  await requireSession();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-12">
        <h1 className="font-heading text-3xl font-extrabold">{t.exam.diagnosticHubTitle}</h1>
        <p className="mb-8 max-w-2xl text-foreground/60">{t.exam.diagnosticHubSubtitle}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HSK_LEVELS.map((lv, i) => (
            <Link
              key={lv}
              href={`/diagnostic/${lv}`}
              className={`card-interactive p-6 animate-card-enter delay-${((i % 5) + 1) * 100}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-2xl font-extrabold">HSK {lv}</span>
                <span className="badge badge-primary">{levelBand(lv)}</span>
              </div>
              <p className="mt-2 text-foreground/60">{t.exam.diagnosticTitle}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
