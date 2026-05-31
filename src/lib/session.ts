import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Get the current session (or null) in a Server Component / Route Handler. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
