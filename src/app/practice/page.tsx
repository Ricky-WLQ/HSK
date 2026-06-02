import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { HSK_LEVELS, levelBand } from "@/lib/vocab";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function PracticeHub() {
  await requireSession();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-12">
        <h1 className="font-heading text-3xl font-extrabold">{t.practice.title}</h1>
        <p className="mb-8 max-w-2xl text-foreground/75">{t.practice.subtitle}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HSK_LEVELS.map((lv, i) => (
            <div
              key={lv}
              className={`card-elevated p-6 animate-card-enter delay-${((i % 5) + 1) * 100}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-2xl font-extrabold">
                  {t.practice.level} {lv}
                </span>
                <span className="badge badge-primary">{levelBand(lv)}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`/practice/${lv}/reading`} className="btn-solid btn-solid-outline text-center text-sm">
                  {t.practice.reading}
                </Link>
                <Link href={`/practice/${lv}/listening`} className="btn-solid btn-solid-outline text-center text-sm">
                  {t.practice.listening}
                </Link>
                {lv !== "1" && (
                  <Link href={`/practice/${lv}/writing`} className="btn-solid btn-solid-outline text-center text-sm">
                    {t.practice.writing}
                  </Link>
                )}
                {lv === "7-9" && (
                  <Link href={`/practice/${lv}/translation`} className="btn-solid btn-solid-outline text-center text-sm">
                    {t.practice.translation}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
