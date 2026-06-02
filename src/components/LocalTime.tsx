"use client";

// Renders a UTC instant in the viewer's own locale + timezone. The server render
// (UTC) differs from the client render (local), so hydration warnings are suppressed.
export default function LocalTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}
