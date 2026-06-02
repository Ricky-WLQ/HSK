import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import GrammarLevel from "@/components/GrammarLevel";
import { getGrammarLevel, isHskLevel, levelBand } from "@/lib/grammar";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function GrammarLevelPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  await requireSession();
  const { level } = await params;
  if (!isHskLevel(level)) notFound();
  const points = await getGrammarLevel(level);
  const drills = points.reduce((n, p) => n + p.drills.length, 0);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-10">
        <div className="mb-6">
          <Link href="/grammar" className="text-sm text-foreground/75 hover:underline">
            ← {t.grammar.back}
          </Link>
          <h1 className="font-heading text-3xl font-extrabold">
            HSK {level} {t.grammar.title}
          </h1>
          <p className="text-foreground/75">
            {levelBand(level)} · {points.length} {t.grammar.points} · {drills} {t.grammar.drills}
          </p>
        </div>
        <GrammarLevel points={points} level={level} />
      </main>
    </div>
  );
}
