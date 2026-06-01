import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import ExamRunner from "@/components/ExamRunner";
import { assembleExam, MOCK_STRUCTURE } from "@/lib/mock";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: { params: Promise<{ level: string }> }) {
  await requireSession();
  const { level } = await params;
  if (!MOCK_STRUCTURE[level]) notFound();
  const exam = await assembleExam(level, "full");
  if (exam.sections.length === 0) notFound();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="container-app py-8">
        <ExamRunner exam={exam} />
      </main>
    </div>
  );
}
