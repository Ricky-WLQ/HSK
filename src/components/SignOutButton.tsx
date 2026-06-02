"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { t } from "@/i18n";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          await authClient.signOut();
          router.push("/login");
          router.refresh();
        } catch {
          setLoading(false);
        }
      }}
      aria-label={t.nav.signOut}
      className="btn-solid btn-solid-outline min-w-11 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span className="hidden sm:inline">{loading ? t.nav.signingOut : t.nav.signOut}</span>
    </button>
  );
}
