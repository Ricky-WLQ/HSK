// Pure, client-safe HSK level constants (NO node:fs imports — safe to import from
// "use client" components, unlike lib/vocab.ts which loads JSON via the filesystem).
// HSK 3.0 levels are fixed by the exam: 1–6 plus the combined 7–9 band.

export const CLASS_LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"] as const;

/** Human label for a class's optional level focus; null when no level is set. */
export function levelLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  return level === "7-9" ? "HSK 7–9" : `HSK ${level}`;
}
