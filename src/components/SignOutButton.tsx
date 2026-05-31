"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

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
      className="btn-solid btn-solid-outline disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}
