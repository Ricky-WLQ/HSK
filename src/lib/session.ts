import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Get the current session (or null) in a Server Component / Route Handler. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Require a session in a Server Component; redirect to /login if signed out. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
