import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { HSK_LEVELS, levelBand } from "@/lib/vocab";
import { MOCK_STRUCTURE } from "@/lib/mock";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function ExamHub() {
  await requireSession();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-12">
        <h1 className="font-heading text-3xl font-extrabold">{t.exam.hubTitle}</h1>
        <p className="mb-8 max-w-2xl text-foreground/75">{t.exam.hubSubtitle}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HSK_LEVELS.map((lv, i) => {
            const specs = MOCK_STRUCTURE[lv] ?? [];
            const q = specs.reduce((n, s) => n + s.questions, 0);
            const min = specs.reduce((n, s) => n + s.minutes, 0);
            return (
              <Link
                key={lv}
                href={`/exam/${lv}`}
                className={`card-interactive p-6 animate-card-enter delay-${((i % 5) + 1) * 100}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-2xl font-extrabold">HSK {lv}</span>
                  <span className="badge badge-primary">{levelBand(lv)}</span>
                </div>
                <p className="mt-2 text-foreground/75">
                  {q} {t.exam.questions} · {min} {t.exam.minutes}
                </p>
                <p className="mt-1 text-xs text-foreground/65">{specs.map((s) => s.labelEn).join(" · ")}</p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
