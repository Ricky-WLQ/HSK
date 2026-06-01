import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getPracticeSetsForLevel } from "@/lib/exam";
import { isHskLevel } from "@/lib/vocab";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function ListeningSetList({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  await requireSession();
  const { level } = await params;
  if (!isHskLevel(level)) notFound();
  const sets = await getPracticeSetsForLevel(level, "listening");

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-10">
        <Link href="/practice" className="text-sm text-foreground/60 hover:underline">
          ← {t.practice.back}
        </Link>
        <h1 className="font-heading mt-1 text-3xl font-extrabold">
          {t.practice.level} {level} · {t.practice.listening}
        </h1>

        {sets.length === 0 ? (
          <p className="mt-6 text-foreground/60">{t.practice.noListeningSets}</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {sets.map((s) => (
              <Link
                key={s.id}
                href={`/practice/${level}/listening/${s.id}`}
                className="card-interactive p-5"
              >
                <div className="font-semibold">{s.titleZh}</div>
                <div className="text-sm text-foreground/60">
                  {s.title} · {s.questionCount} {t.practice.questions}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
