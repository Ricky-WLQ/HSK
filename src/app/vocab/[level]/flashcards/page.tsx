import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import Flashcards from "@/components/Flashcards";
import { getVocabLevel, isHskLevel } from "@/lib/vocab";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function FlashcardsPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level } = await params;
  if (!isHskLevel(level)) notFound();
  const words = await getVocabLevel(level);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-10">
        <h1 className="font-heading mb-6 text-center text-2xl font-extrabold">
          HSK {level} · {t.vocab.flashcards}
        </h1>
        <Flashcards words={words} level={level} />
      </main>
    </div>
  );
}
