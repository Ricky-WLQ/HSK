"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { t } from "@/i18n";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await authClient.signUp.email({ email, password, name });
        if (error) {
          setError(error.message ?? t.auth.signUpFailed);
          return;
        }
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) {
          setError(error.message ?? t.auth.signInFailed);
          return;
        }
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t.auth.genericError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-warm-gradient px-4">
      <div className="card-elevated w-full max-w-md p-8">
        <Link
          href="/"
          className="font-heading mb-6 block text-center text-lg font-extrabold text-gradient-hero"
        >
          {t.app.name}
        </Link>
        <h1 className="font-heading mb-1 text-center text-2xl font-extrabold">
          {mode === "signin" ? t.auth.welcomeBack : t.auth.createAccount}
        </h1>
        <p className="mb-6 text-center text-sm text-foreground/75">
          {mode === "signin" ? t.auth.signInSubtitle : t.auth.signUpSubtitle}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-sm font-semibold" htmlFor="name">
                {t.auth.name}
              </label>
              <input
                id="name"
                className="input-clay"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="email">
              {t.auth.email}
            </label>
            <input
              id="email"
              type="email"
              className="input-clay"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="password">
              {t.auth.password}
            </label>
            <input
              id="password"
              type="password"
              className="input-clay"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <p className="badge badge-error w-full justify-center py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-solid btn-solid-primary w-full"
          >
            {loading
              ? t.auth.pleaseWait
              : mode === "signin"
                ? t.auth.signInBtn
                : t.auth.createAccountBtn}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/75">
          {mode === "signin" ? t.auth.newHere : t.auth.haveAccount}{" "}
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
          >
            {mode === "signin" ? t.auth.toSignUp : t.auth.toSignIn}
          </button>
        </p>
      </div>
    </div>
  );
}
