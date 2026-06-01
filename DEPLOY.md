# Deploy runbook (Zeabur)

Live: https://hsk-online.zeabur.app · GitHub: Ricky-WLQ/HSK (auto-redeploys on push to `main`).

## Required production env vars (Zeabur → service → Variables)
- `DATABASE_URL` = `${POSTGRES_CONNECTION_STRING}`
- `BETTER_AUTH_SECRET` = strong 32+ char secret (`openssl rand -base64 32`) — app refuses to boot without it
- `BETTER_AUTH_URL` = `https://hsk-online.zeabur.app` — must NOT be localhost in prod
- `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` (audio bank)
- `DEEPSEEK_API_KEY`, `SILICONFLOW_API_KEY` (build-time scripts only — definitions, ASR audit, images; not needed at runtime)

TTS uses **Edge TTS** (Microsoft neural voices via `edge-tts-universal`) — free, no API key, no env var.

## Deploy flow
1. `git push origin main` → Zeabur builds (`next build --webpack`).
2. If the app shows `ImagePullBackOff`, run `npx zeabur@latest service restart --id <app-service-id>`.
3. **Migrations** run automatically via the `start` script (`prisma migrate deploy && next start`).
   Belt-and-suspenders: also run `zeabur service exec <app> -- '--' npx prisma migrate deploy`
   after a deploy that adds a migration, and confirm in logs that it applied.
4. Verify from inside the container (the sandbox can't reach the public URL):
   `zeabur service exec <app> -- '--' node -e "fetch('http://localhost:8080/api/...', {...})"`.

## Pre-generating the TTS audio bank
`python scripts/pregenerate-tts.py` — Edge TTS → R2 (idempotent; skips clips already tagged
`engine=edge`). Run after vocab data changes. Runtime `/api/tts` lazily fills any gaps via Edge TTS,
so the app works before the bank is fully warm. (Requires `pip install edge-tts boto3`.)
