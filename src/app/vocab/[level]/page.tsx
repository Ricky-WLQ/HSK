import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import VocabBrowser from "@/components/VocabBrowser";
import { getVocabLevel, isHskLevel, levelBand } from "@/lib/vocab";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function VocabLevelPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  await requireSession();
  const { level } = await params;
  if (!isHskLevel(level)) notFound();
  const words = await getVocabLevel(level);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/vocab" className="text-sm text-foreground/60 hover:underline">
              ← {t.vocab.back}
            </Link>
            <h1 className="font-heading text-3xl font-extrabold">
              HSK {level} {t.vocab.title}
            </h1>
            <p className="text-foreground/60">
              {levelBand(level)} · {words.length.toLocaleString()} {t.vocab.words}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/vocab/${level}/quiz`}
              className="btn-solid btn-solid-secondary"
            >
              {t.vocab.quiz}
            </Link>
            <Link
              href={`/vocab/${level}/flashcards`}
              className="btn-solid btn-solid-primary"
            >
              {t.vocab.flashcards}
            </Link>
          </div>
        </div>
        <VocabBrowser words={words} />
      </main>
    </div>
  );
}
