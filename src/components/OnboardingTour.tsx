"use client";

import { useEffect, useState } from "react";
import {
  X,
  Sparkles,
  BookOpen,
  FileText,
  Languages,
  ClipboardCheck,
  TrendingUp,
  Rocket,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { t } from "@/i18n";

const KEY = "hsk-onboarded-v1";
const ICONS = [Sparkles, BookOpen, FileText, Languages, ClipboardCheck, TrendingUp, Rocket];

// First-run welcome tour. Auto-shows once (tracked in localStorage); the inline
// button replays it. Also listens for a "hsk:replay-tour" window event.
export default function OnboardingTour() {
  const steps = t.tour.steps;
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        setStep(0);
        setVisible(true);
      }
    } catch {
      /* localStorage unavailable */
    }
    const replay = () => {
      setStep(0);
      setVisible(true);
    };
    window.addEventListener("hsk:replay-tour", replay);
    return () => window.removeEventListener("hsk:replay-tour", replay);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  const last = step === steps.length - 1;
  const Icon = ICONS[step] ?? Sparkles;
  const cur = steps[step] ?? steps[0];

  return (
    <>
      <button
        onClick={() => {
          setStep(0);
          setVisible(true);
        }}
        className="btn-ghost text-sm text-foreground/60"
      >
        {t.tour.replay}
      </button>

      {visible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={cur.title}
        >
          <div className="card-elevated animate-scale-in relative w-full max-w-md p-7 text-center">
            <button
              onClick={dismiss}
              aria-label={t.tour.skip}
              className="absolute right-4 top-4 text-foreground/40 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-lighter text-primary">
              <Icon className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-heading text-2xl font-extrabold">{cur.title}</h2>
            <p className="mt-2 leading-relaxed text-foreground/70">{cur.body}</p>

            <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-card-border"}`}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => (step > 0 ? setStep(step - 1) : dismiss())}
                className="btn-ghost text-sm"
              >
                {step > 0 ? (
                  <span className="flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" />
                    {t.tour.back}
                  </span>
                ) : (
                  t.tour.skip
                )}
              </button>
              <button
                onClick={() => (last ? dismiss() : setStep(step + 1))}
                className="btn-solid btn-solid-primary"
              >
                {last ? (
                  t.tour.getStarted
                ) : (
                  <span className="flex items-center gap-1">
                    {t.tour.next}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
