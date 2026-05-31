import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the file-tracing root to this app so unrelated lockfiles elsewhere
  // (e.g. a stray package-lock.json in the home dir) don't confuse Next.
  outputFileTracingRoot: path.resolve(),
  // Keep native / server-only packages external to the bundler.
  // better-auth is server-only and pulls in optional DB adapters (kysely, etc.)
  // that ship as CommonJS — bundling them trips webpack's strict ESM analysis,
  // so we require them at runtime instead.
  serverExternalPackages: ["@prisma/client", "prisma", "ffmpeg-static", "better-auth"],
};

export default nextConfig;
