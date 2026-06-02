"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MousePointer2, X } from "lucide-react";
import { t } from "@/i18n";

const KEY = "hsk-onboarded-v2";
// One entry per t.tour.steps item. `target` = a data-tour selector to spotlight;
// null = a centered intro/outro card.
const TARGETS: (string | null)[] = [
  null, // Welcome
  '[data-tour="vocab"]',
  '[data-tour="practice"]',
  '[data-tour="grammar"]',
  '[data-tour="exam"]',
  '[data-tour="progress"]',
  null, // You're all set
];

type Box = { left: number; top: number; width: number; height: number };

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function OnboardingTour() {
  const steps = t.tour.steps;
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [tap, setTap] = useState(false);
  const rafRef = useRef<number | null>(null);

  const locate = useCallback((i: number) => {
    const sel = TARGETS[i];
    if (!sel) {
      setBox(null);
      return;
    }
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) {
      setBox(null);
      return;
    }
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    // Measure after the scroll settles.
    rafRef.current && cancelAnimationFrame(rafRef.current);
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      setCursor({ x: cx, y: cy });
      setTap(false);
      window.setTimeout(() => setTap(true), reducedMotion() ? 0 : 650);
    };
    window.setTimeout(measure, reducedMotion() ? 0 : 380);
  }, []);

  // open on first visit + listen for replay
  useEffect(() => {
    let firstRun = false;
    try {
      firstRun = !localStorage.getItem(KEY);
    } catch {
      /* ignore */
    }
    if (firstRun) {
      setStep(0);
      setActive(true);
    }
    const replay = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("hsk:replay-tour", replay);
    return () => window.removeEventListener("hsk:replay-tour", replay);
  }, []);

  useEffect(() => {
    if (!active) return;
    setCursor((c) => c ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    locate(step);
    const onResize = () => locate(step);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, step, locate]);

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setActive(false);
  }

  const last = step === steps.length - 1;
  const cur = steps[step] ?? steps[0];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setActive(true);
        }}
        className="btn-ghost text-sm text-foreground/75"
      >
        {t.tour.replay}
      </button>

      {active && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={cur.title}>
          {/* Dim: full overlay for centered steps; box-shadow "cutout" spotlight for targeted steps. */}
          {box ? (
            <div
              aria-hidden
              className="pointer-events-none fixed rounded-2xl border-[3px] border-primary transition-all duration-500"
              style={{
                left: box.left - 8,
                top: box.top - 8,
                width: box.width + 16,
                height: box.height + 16,
                boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
              }}
            />
          ) : (
            <div aria-hidden className="fixed inset-0 bg-foreground/45 backdrop-blur-sm" />
          )}

          {/* Animated pointer cursor (skipped if no target). */}
          {box && cursor && (
            <div
              aria-hidden
              className="pointer-events-none fixed z-[60]"
              style={{
                left: cursor.x,
                top: cursor.y,
                transition: reducedMotion() ? "none" : "left 0.6s cubic-bezier(0.34,1.56,0.64,1), top 0.6s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              <MousePointer2
                className={`h-11 w-11 -translate-x-1 -translate-y-1 text-navy drop-shadow-lg ${tap ? "animate-pop" : ""}`}
                fill="white"
                strokeWidth={1.5}
              />
            </div>
          )}

          {/* Caption: bottom for targeted steps, centered for intro/outro. */}
          <div
            className={
              box
                ? "fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
                : "fixed inset-0 z-[60] flex items-center justify-center p-4"
            }
          >
            <div className="card-elevated animate-scale-in pointer-events-auto relative w-full max-w-sm p-6 text-center">
              <button
                onClick={dismiss}
                aria-label={t.tour.skip}
                className="absolute right-3 top-3 text-foreground/65 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
              <h2 className="font-heading text-xl font-extrabold">{cur.title}</h2>
              <p className="mt-2 leading-relaxed text-foreground/70">{cur.body}</p>

              <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-card-border"}`}
                  />
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() => (step > 0 ? setStep(step - 1) : dismiss())}
                  className="btn-ghost text-sm"
                >
                  {step > 0 ? t.tour.back : t.tour.skip}
                </button>
                <button
                  onClick={() => (last ? dismiss() : setStep(step + 1))}
                  className="btn-solid btn-solid-primary"
                >
                  {last ? t.tour.getStarted : t.tour.next}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
