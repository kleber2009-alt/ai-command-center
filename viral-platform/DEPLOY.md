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

## GitHub secrets / variables

**Secrets**
- `HETZNER_SSH_KEY` — already used by the other deploys.
- `VP_ENV_FILE` — the full body of `/etc/viral-platform.env` (template below).

**Variables**
- `VP_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `VP_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

> The two `NEXT_PUBLIC_*` values are inlined into the web bundle at build time,
> so they're repo **variables** (not secret) and also passed as build args.

## `/etc/viral-platform.env` template (→ `VP_ENV_FILE`)

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

## Deploy

Push to `main` (paths under `viral-platform/**`) or run the
**deploy-viral-platform** workflow manually. It SSHes in, pulls the repo, writes
`/etc/viral-platform.env`, then:

1. builds `vp-web` + the worker image,
2. starts `vp-postgres`/`vp-redis` and runs `@vp/db migrate`
   (creates the `vector` extension, applies the generated schema, then the
   custom halfvec HNSW indexes),
3. (re)creates web + all workers,
4. health-checks `http://localhost:3018/`.

### Manual equivalent (on the box)
```bash
cd /root/ai-command-center/viral-platform
C="docker compose -f docker-compose.prod.yml --env-file /etc/viral-platform.env"
$C build
$C up -d vp-postgres vp-redis
$C run --rm vp-worker-broll pnpm --filter @vp/db migrate
$C up -d
```

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
