import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, CheckCircle2 } from "lucide-react";
import { requireTeacher } from "@/lib/session";
import { getAssignmentDetail } from "@/lib/assignments";
import { levelLabel } from "@/lib/levels";
import SignOutButton from "@/components/SignOutButton";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import { t } from "@/i18n";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  completed: "badge-success",
  overdue: "badge-error",
  not_started: "badge-info",
};

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const session = await requireTeacher();
  const { classId, assignmentId } = await params;

  const a = await getAssignmentDetail(assignmentId, session.user.id);
  if (!a || a.classId !== classId) notFound();

  return (
    <div className="min-h-screen">
      <header className="nav-bar">
        <div className="container-app flex h-16 items-center justify-between">
          <Link href="/" className="font-heading text-xl font-extrabold text-gradient-hero">
            {t.app.name}
          </Link>
          <div className="flex items-center gap-2">
            <FontSizeControl />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="container-app py-12">
        <Link href={`/teacher/classes/${a.classId}`} className="btn-ghost mb-4 inline-flex px-3 py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> {t.assignments.backToClass}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading flex items-center gap-2 text-3xl font-extrabold">
              <ClipboardList className="h-7 w-7 text-primary" /> {a.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="badge badge-info">{t.assignments.typeNames[a.type]}</span>
              {a.target && <span className="badge badge-primary">{levelLabel(a.target.level)}</span>}
              {a.dueDate && (
                <span className="badge">
                  {t.assignments.dueLabel}: {new Date(a.dueDate).toISOString().slice(0, 16).replace("T", " ")}
                </span>
              )}
            </div>
            {a.description && <p className="mt-2 text-foreground/75">{a.description}</p>}
          </div>
          <div className="card-flat px-5 py-3 text-center">
            <div className="text-2xl font-extrabold text-success">
              {a.completed}/{a.total}
            </div>
            <div className="text-xs text-foreground/75">{t.assignments.completed}</div>
          </div>
        </div>

        <h2 className="font-heading mt-8 text-lg font-bold text-foreground/70">{t.teacher.roster}</h2>
        {a.rows.length === 0 ? (
          <p className="card-flat mt-3 px-5 py-8 text-center text-foreground/75">{t.assignments.noOne}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {a.rows.map((r) => (
              <li key={r.studentId} className="card-flat flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="font-semibold">{r.name || r.email}</div>
                  <div className="truncate text-sm text-foreground/70">{r.email}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {r.status === "completed" && r.score != null && (
                    <span className="font-semibold text-success">
                      {t.assignments.score}: {r.score}%
                      {r.correctCount != null && r.totalQuestions != null && (
                        <span className="text-foreground/70"> ({r.correctCount}/{r.totalQuestions})</span>
                      )}
                    </span>
                  )}
                  {r.completedAt && (
                    <span className="text-foreground/70">
                      {t.assignments.completedOn} {new Date(r.completedAt).toISOString().slice(0, 10)}
                    </span>
                  )}
                  <span className={`badge ${STATUS_BADGE[r.status]} inline-flex items-center gap-1`}>
                    {r.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {t.assignments.statusNames[r.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
