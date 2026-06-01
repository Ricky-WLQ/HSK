import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import VocabQuiz from "@/components/VocabQuiz";
import { getVocabLevel, isHskLevel, sampleWords } from "@/lib/vocab";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  await requireSession();
  const { level } = await params;
  if (!isHskLevel(level)) notFound();
  const all = await getVocabLevel(level);
  // A quiz only needs ~12 questions + distractors; sample server-side so we don't
  // ship the entire level (hsk7-9.json is ~2 MB) to the client just to pick 12.
  const pool = all.filter((w) => w.definition && w.definition.length > 0);
  const words = sampleWords(pool, 80);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-10">
        <h1 className="font-heading mb-6 text-center text-2xl font-extrabold">
          HSK {level} · {t.vocab.quiz}
        </h1>
        {words.length < 4 ? (
          <p className="text-center text-foreground/60">{t.vocab.noQuizYet}</p>
        ) : (
          <VocabQuiz words={words} level={level} />
        )}
      </main>
    </div>
  );
}
