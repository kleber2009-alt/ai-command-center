# Deploy — viral-platform on Hetzner (46.62.215.11)

Runs as an **isolated docker-compose project** (`viral-platform`) with its own
pgvector Postgres + Redis, so it never touches the shared `infra-postgres` /
`aisales-postgres` databases.

| Component | Container | Notes |
|---|---|---|
| Web (Next.js + tRPC + SSE) | `vp-web` | host `:3018` → Caddy |
| Workers | `vp-worker-{transcribe,detect,broll,library,render}` | one image, ffmpeg included |
| Postgres 16 + pgvector ≥0.8 | `vp-postgres` | internal only |
| Redis 7 | `vp-redis` | internal only |

## One-time setup on the box

1. **DNS/Caddy** — append `deploy/Caddyfile.snippet` to `/etc/caddy/Caddyfile`,
   then `caddy reload` (or `systemctl reload caddy`). Serves
   `https://viral.46-62-215-11.nip.io` → `localhost:3018`.
2. **R2 buckets** — create `viral-videos` and `user-library` in Cloudflare R2
   (set `user-library` lifecycle: delete soft-deleted objects after 7 days, §4.4.7).
3. **GitHub** — add the secrets/vars below.

## CI-only secrets / variables (skip for manual deploy)

**Secrets:** `HETZNER_SSH_KEY`, `VP_ENV_FILE` (full body of the `.env` below).
**Variables:** `VP_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `VP_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## `.env` template (copy from `.env.prod.example`)

The `NEXT_PUBLIC_*` values are inlined into the web bundle **at build time** —
if `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is missing, `next build` fails with
"Missing publishableKey".

```dotenv
NODE_ENV=production
# --- Postgres (internal; vp-postgres reads POSTGRES_*; app reads DATABASE_URL) ---
POSTGRES_USER=viral
POSTGRES_PASSWORD=<strong-random>
POSTGRES_DB=viral_platform
DATABASE_URL=postgresql://viral:<strong-random>@vp-postgres:5432/viral_platform
REDIS_URL=redis://vp-redis:6379
# --- Auth ---
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
# --- Storage (Cloudflare R2) ---
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_VIDEO=viral-videos
R2_BUCKET_LIBRARY=user-library
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_PUBLIC_URL=
# --- AI ---
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
GEMINI_API_KEY=
# --- B-roll providers ---
PEXELS_API_KEY=
PIXABAY_API_KEY=
# --- Payments ---
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

## Deploy — demo mode (zero external keys)

Just want the site up with no Clerk/AI/R2 keys? Use demo mode — `.env.demo.example`
sets `NEXT_PUBLIC_AUTH_DISABLED=true`, so the app builds and runs with no auth
under a shared demo user:
```bash
cd /root/viral-platform
cp .env.demo.example .env
nano .env                 # only change POSTGRES_PASSWORD (and the one in DATABASE_URL)
./scripts/deploy.sh
```
Caveats: (1) **no login — open to anyone** who reaches the URL; (2) the UI works
but **video processing/upload still need AI + R2 keys** (jobs fail without them,
credits refund). Fill those in and re-run to enable the pipeline.

## Deploy — manual with auth (recommended for real use)

Drop the project folder anywhere on the box (e.g. `/root/viral-platform`), then:
```bash
cd /root/viral-platform
cp .env.prod.example .env
nano .env                 # fill in real keys (Clerk pk_ is mandatory)
./scripts/deploy.sh       # build → migrate → up → health-check
```
`scripts/deploy.sh` reads the local `.env`, builds `vp-web` + the worker image,
starts `vp-postgres`/`vp-redis`, runs `@vp/db migrate` (creates the `vector`
extension, applies the schema, then the custom halfvec HNSW indexes), recreates
web + all workers, and health-checks `http://localhost:3018/`. Re-run any time.

## Deploy — CI (optional)

Push to `main` (paths under `viral-platform/**`) or run **deploy-viral-platform**
manually. It SSHes in, pulls the repo, writes `/etc/viral-platform.env`, copies
it to `viral-platform/.env`, and runs `scripts/deploy.sh`.

## What works once deployed

Upload → transcribe (Deepgram) → clip detection (Claude) → **B-roll plan in all
three modes** (Auto Stock / My Library / Hybrid) → base 9:16/1:1/16:9 export;
the `/library` indexing pipeline (Gemini vision + embeddings + pgvector).

**Not yet wired** (returns/exports without these): render **compositing** —
overlaying B-roll + burning captions (Remotion) — Stripe fulfilment, and the
`ai-py` Whisper/embeddings fallbacks. See README "Implementation status".

## Webhooks to register after first deploy
- Clerk → `https://viral.46-62-215-11.nip.io/api/webhooks/clerk` (set `CLERK_WEBHOOK_SECRET`).
- Stripe → (once billing is wired) the Stripe webhook endpoint.

## Backup & migration

See [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) — what is state, `scripts/backup.sh` / `scripts/restore.sh`, and the full new-server migration runbook.
