"use client";

import { useSyncExternalStore } from "react";
import { getScaleIndex, setScaleIndex, FONT_SCALES } from "@/lib/fontscale";

const noop = () => () => {};
function subscribe(cb: () => void) {
  window.addEventListener("fontscalechange", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("fontscalechange", cb);
    window.removeEventListener("storage", cb);
  };
}

// A−/A+ text-size control. Large, clearly-labelled tap targets for older users.
export default function FontSizeControl() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const idx = useSyncExternalStore(subscribe, getScaleIndex, () => 0);
  const last = FONT_SCALES.length - 1;

  const btn =
    "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 font-bold text-foreground transition hover:bg-primary-lighter disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div
      role="group"
      aria-label={`Text size${mounted ? `: ${FONT_SCALES[idx]}%` : ""}`}
      className="flex items-center rounded-xl border-2 border-card-border bg-card"
    >
      <button
        type="button"
        onClick={() => setScaleIndex(idx - 1)}
        disabled={!mounted || idx <= 0}
        aria-label="Decrease text size"
        title="Smaller text"
        className={btn}
      >
        <span className="text-xs leading-none">A</span>
        <span className="leading-none">−</span>
      </button>
      <span aria-hidden className="px-1 text-[10px] font-semibold text-foreground/65">
        {mounted ? `${FONT_SCALES[idx]}%` : "A"}
      </span>
      <button
        type="button"
        onClick={() => setScaleIndex(idx + 1)}
        disabled={!mounted || idx >= last}
        aria-label="Increase text size"
        title="Larger text"
        className={btn}
      >
        <span className="text-base leading-none">A</span>
        <span className="leading-none">+</span>
      </button>
    </div>
  );
}
