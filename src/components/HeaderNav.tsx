"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import FontSizeControl from "@/components/FontSizeControl";
import { t } from "@/i18n";

const LINKS = [
  { href: "/vocab", label: t.vocab.title },
  { href: "/grammar", label: t.grammar.title },
  { href: "/practice", label: t.practice.title },
  { href: "/exam", label: t.exam.nav },
  { href: "/progress", label: t.progress.nav },
];

export default function HeaderNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const dest = signedIn ? "/dashboard" : "/login";
  const destLabel = signedIn ? t.nav.dashboard : t.nav.signIn;

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden items-center gap-1.5 lg:flex" aria-label="Main navigation">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="btn-ghost px-3 py-2 text-sm">
            {l.label}
          </Link>
        ))}
        <FontSizeControl />
        <ThemeToggle />
        <Link href={dest} className="btn-solid btn-solid-primary px-4 py-2 text-sm">
          {destLabel}
        </Link>
      </nav>

      {/* Mobile / tablet controls */}
      <div className="flex items-center gap-2 lg:hidden">
        <FontSizeControl />
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-card-border bg-card"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="absolute inset-x-0 top-16 z-40 border-b border-card-border bg-background/97 shadow-lg backdrop-blur lg:hidden">
          <nav className="container-app flex flex-col gap-1 py-3" aria-label="Mobile navigation">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-semibold hover:bg-surface"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href={dest}
              onClick={() => setOpen(false)}
              className="btn-solid btn-solid-primary mt-2 py-3 text-base"
            >
              {destLabel}
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
