import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getProgressSummary, type SectionStat } from "@/lib/progress";
import { requireSession } from "@/lib/session";
import { levelBand } from "@/lib/vocab";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

const sectionLabel = (s: string) => (t.progress.sections as Record<string, string>)[s] ?? s;
const pct = (a: number) => Math.round(a * 100);

function sectionLink(section: string): string {
  if (section === "grammar") return "/grammar";
  if (section === "mock" || section === "diagnostic") return "/exam";
  return "/practice";
}

function Bar({ value }: { value: number }) {
  const color = value >= 0.8 ? "bg-success" : value >= 0.6 ? "bg-primary" : "bg-error";
  return (
    <div className="h-2 w-full rounded-full bg-surface">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(4, pct(value))}%` }} />
    </div>
  );
}

export default async function ProgressPage() {
  const session = await requireSession();
  const s = await getProgressSummary(session.user.id);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-10">
        <h1 className="font-heading text-3xl font-extrabold">{t.progress.title}</h1>
        <p className="mb-8 max-w-2xl text-foreground/75">{t.progress.subtitle}</p>

        {s.totalAttempts === 0 ? (
          <div className="card-elevated p-8 text-center text-foreground/75">{t.progress.noData}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="card-flat px-5 py-4">
                <div className="text-3xl font-extrabold text-primary">{pct(s.overallAccuracy)}%</div>
                <div className="text-sm text-foreground/75">{t.progress.overall}</div>
              </div>
              <div className="card-flat px-5 py-4">
                <div className="text-3xl font-extrabold text-secondary">{s.totalAttempts}</div>
                <div className="text-sm text-foreground/75">{t.progress.attempts}</div>
              </div>
              <div className="card-flat px-5 py-4">
                <div className="text-3xl font-extrabold text-primary">{s.vocabMastered}</div>
                <div className="text-sm text-foreground/75">{t.progress.vocabMastered}</div>
              </div>
              <Link href="/mistakes" className="card-interactive px-5 py-4">
                <div className="text-3xl font-extrabold text-error">{s.mistakes.total}</div>
                <div className="text-sm text-foreground/75">{t.mistakes.title}</div>
              </Link>
            </div>

            {s.weakest && (
              <div className="card-elevated mt-6 flex flex-wrap items-center justify-between gap-3 p-6">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-error">{t.progress.weakSpot}</div>
                  <div className="mt-1 font-heading text-xl font-extrabold">
                    {sectionLabel(s.weakest.section)} · {pct(s.weakest.accuracy)}%
                  </div>
                  <p className="text-sm text-foreground/75">{t.progress.weakSpotDesc}</p>
                </div>
                <Link href={sectionLink(s.weakest.section)} className="btn-solid btn-solid-primary">
                  {t.progress.practiceNow}
                </Link>
              </div>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="card-elevated p-6">
                <h2 className="mb-4 font-heading text-lg font-bold">{t.progress.bySection}</h2>
                <div className="space-y-3">
                  {s.bySection.map((sec: SectionStat) => (
                    <div key={sec.section}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-semibold">{sectionLabel(sec.section)}</span>
                        <span className="text-foreground/75">
                          {pct(sec.accuracy)}% · {sec.correct}/{sec.questions}
                        </span>
                      </div>
                      <Bar value={sec.accuracy} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="card-elevated p-6">
                <h2 className="mb-4 font-heading text-lg font-bold">{t.progress.byLevel}</h2>
                <div className="space-y-3">
                  {s.byLevel.map((lv) => (
                    <div key={lv.level} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                        <span className="font-semibold">HSK {lv.level}</span>
                        <span className="badge badge-info">{levelBand(lv.level)}</span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-sm text-foreground/75">
                        {lv.attempts} {t.progress.attempts} · {pct(lv.accuracy)}%
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {s.examScores.length > 0 && (
              <section className="card-elevated mt-6 p-6">
                <h2 className="mb-3 font-heading text-lg font-bold">{t.progress.exams}</h2>
                <ul className="divide-y divide-card-border">
                  {s.examScores.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-semibold">
                        HSK {a.level} {sectionLabel(a.section)}
                      </span>
                      <span className="text-foreground/75">
                        {a.correctCount ?? 0}/{a.totalQuestions} {t.progress.score.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {s.recent.length > 0 && (
            <section className="card-elevated mt-6 mb-10 p-6">
              <h2 className="mb-3 font-heading text-lg font-bold">{t.progress.recent}</h2>
              <ul className="divide-y divide-card-border">
                {s.recent.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-semibold">
                      HSK {a.level} {sectionLabel(a.section)}
                    </span>
                    <span className="text-foreground/75">
                      {a.correctCount ?? 0}/{a.totalQuestions}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
