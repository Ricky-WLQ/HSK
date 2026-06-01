import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import WritingRunner from "@/components/WritingRunner";
import { getPracticeSet } from "@/lib/exam";
import { isHskLevel } from "@/lib/vocab";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TakeTranslationSet({
  params,
}: {
  params: Promise<{ level: string; setId: string }>;
}) {
  await requireSession();
  const { level, setId } = await params;
  if (!isHskLevel(level)) notFound();
  const set = await getPracticeSet(setId);
  if (!set || set.level !== level || set.section !== "translation") notFound();

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-8">
        <h1 className="font-heading mb-6 text-center text-xl font-extrabold">{set.titleZh}</h1>
        <WritingRunner set={set} />
      </main>
    </div>
  );
}
