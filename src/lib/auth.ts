import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { ac, roles } from "@/lib/permissions";

// Fail loud if a production deployment is misconfigured (weak session secret or a
// localhost base URL would silently break cookies/CSRF). Skipped during the build
// phase (env vars may be absent then) and in development.
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32 || secret.includes("dev-secret")) {
    throw new Error("BETTER_AUTH_SECRET must be a strong (>=32 char) secret in production");
  }
  if (!process.env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL.includes("localhost")) {
    throw new Error("BETTER_AUTH_URL must be set to the production URL");
  }
}

const trustedOrigins = [process.env.BETTER_AUTH_URL, "https://hsk-online.zeabur.app"].filter(
  (o): o is string => Boolean(o),
);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    adminPlugin({
      ac,
      roles,
      defaultRole: "student",
      adminRoles: ["admin"],
    }),
    // nextCookies must be the LAST plugin so it can set cookies after others run.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
