import SiteHeader from "@/components/SiteHeader";
import MistakeList from "@/components/MistakeList";
import { getMistakes } from "@/lib/progress";
import { requireSession } from "@/lib/session";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const session = await requireSession();
  const mistakes = await getMistakes(session.user.id);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-10">
        <h1 className="font-heading text-3xl font-extrabold">{t.mistakes.title}</h1>
        <p className="mb-8 max-w-2xl text-foreground/75">{t.mistakes.subtitle}</p>
        {mistakes.length === 0 ? (
          <div className="card-elevated p-8 text-center text-foreground/75">{t.mistakes.empty}</div>
        ) : (
          <MistakeList mistakes={mistakes} />
        )}
      </main>
    </div>
  );
}
