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
  serverExternalPackages: ["@prisma/client", "prisma", "better-auth", "edge-tts-universal", "livekit-server-sdk"],
  experimental: {
    // Build-node memory guard. Next derives its build worker count from
    // `os.cpus().length - 1` (config-shared.js), which on Zeabur's Lightsail node
    // reads the HOST's 8 physical CPUs — not the container's 2-vCPU cgroup — so it
    // spawns 7 workers. On the 4 GB container, 7 "Collecting page data" workers
    // (~0.6–0.8 GB each) overran RAM and the kernel OOM-killed the build (silent
    // SIGKILL, no error). Pinning to 2 (the real vCPU count) caps it at 2 workers
    // (getNumberOfWorkers, build/index.js:311) with wide headroom. Build-only:
    // does not change runtime behavior or build output.
    cpus: 2,
  },
};

export default nextConfig;
