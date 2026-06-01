# Production image for Zeabur — mirrors the proven CET deployment (planType: docker,
# slim Debian base, single-stage, full deps; verified RUNNING in production).
#
# Root cause of the earlier ImagePullBackOff: Zeabur's auto-buildpack built on the
# FULL node:24 base (~1.1GB for the base alone) -> a ~2GB multi-layer image that
# intermittently exceeded the runtime node's image-pull timeout. A slim base fixes it:
# CET ships a comparable image on node:22.14-bookworm-slim and pulls + runs reliably,
# which proves the app size was never the problem — the full base was. No `output:
# "standalone"` needed (shipping the real prod deps avoids @vercel/nft tracing gaps).
#
# Debian (not alpine) matches Prisma's debian-openssl-3.0.x engine; openssl installed.

FROM node:24-slim
WORKDIR /app

# Zeabur integration metadata (image-only labels; do not affect build/pull/run).
LABEL "language"="nodejs"
LABEL "framework"="next.js"

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NEXT_TELEMETRY_DISABLED=1

# openssl: Prisma query engine. ca-certificates: outbound HTTPS (R2, DeepSeek, SiliconFlow).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Placeholder so the `prisma generate` postinstall and `next build` never trip over a
# missing DATABASE_URL at build time. The REAL value is injected by Zeabur at runtime
# (used by `prisma migrate deploy` and the running server). Build-time auth-secret guards
# are already skipped in the build phase (NEXT_PHASE === "phase-production-build").
ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

# Schema present before install so the prisma generate postinstall succeeds.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN DATABASE_URL=$DATABASE_URL npm ci

COPY . .
RUN DATABASE_URL=$DATABASE_URL npm run build && rm -rf .next/cache

EXPOSE 8080
# Zeabur injects PORT=8080. Apply pending migrations, then start the Next.js server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 8080 -H 0.0.0.0"]
