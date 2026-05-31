import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { ac, roles } from "@/lib/permissions";

export const auth = betterAuth({
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
