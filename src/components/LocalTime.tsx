"use client";

// Renders a UTC instant in the viewer's own locale + timezone. The server render
// (UTC) differs from the client render (local), so hydration warnings are suppressed.
export default function LocalTime({ iso, dateOnly }: { iso: string | Date; dateOnly?: boolean }) {
  const d = new Date(iso);
  return (
    <time dateTime={d.toISOString()} suppressHydrationWarning>
      {d.toLocaleString([], dateOnly ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
