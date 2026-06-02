import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getGrammarIndex, levelBand } from "@/lib/grammar";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function GrammarHub() {
  await requireSession();
  const index = await getGrammarIndex();

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-12">
        <h1 className="font-heading text-3xl font-extrabold">{t.grammar.title}</h1>
        <p className="mb-8 max-w-2xl text-foreground/75">{t.grammar.subtitle}</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {index.levels.map((lv, i) => (
            <Link
              key={lv.level}
              href={`/grammar/${lv.level}`}
              className={`card-interactive p-6 animate-card-enter delay-${((i % 5) + 1) * 100}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-2xl font-extrabold">HSK {lv.level}</span>
                <span className="badge badge-primary">{levelBand(lv.level)}</span>
              </div>
              <p className="mt-2 text-foreground/75">
                {lv.points} {t.grammar.points} · {lv.drills} {t.grammar.drills}
              </p>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs text-foreground/65">{index.standard} · {index.source}</p>
      </main>
    </div>
  );
}
