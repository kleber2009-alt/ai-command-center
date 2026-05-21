# ai-hub — CLAUDE.md

SaaS aggregator of NN tools with a single token wallet. 16 tools
(image/video/upscale Topaz / face-swap / nano-banana / carousel /
reels-script). Providers: fal.ai, Replicate, kie.ai.

Prod:
- Landing: `aihub.46-62-215-11.nip.io`
- App: `aihub-app.46-62-215-11.nip.io` (fallback HTTP `:3010`)
- TMA: bot `@aicex_one_bot`

Source-of-truth docs in this app:
- `README.md` — стек, локальный запуск, архитектура
- `ROADMAP.md` — канон по фичам и итерациям
- `DEPLOY.md` — прод-деплой пошагово
- `TELEGRAM.md` — Telegram Stars + bot integration
- `docs/architecture-research.md` — провайдерская стратегия, ledger-first wallet, pricing, security / GDPR, 6-month budget

Treat those as authoritative. This file is just the «what to read first» pointer + critical invariants.

## Stack

- Next.js 14 (App Router) + TypeScript
- Postgres — db `ai_hub` inside the existing `aisales-postgres` container (already covered by `pg_backup`, gap to verify: see `docs/backup-restore.md`)
- Drizzle ORM (TypeScript schema = source of truth)
- Auth.js v5 (NextAuth) — passwordless magic-link via SMTP
- MinIO (`aisales-minio`) — Storage via S3 SDK; bucket `ai-hub-media`
- BullMQ + Redis (`aisales-redis`, db 1)
- Nodemailer (Resend / Postmark / SES / любой SMTP)
- Tailwind + shadcn/ui-style components

## Wallet — critical

Wallet is **race-free** via 4 atomic `SECURITY DEFINER` Postgres functions:

- `wallet_reserve` — hold tokens for an in-flight job
- `wallet_charge` — settle hold to actual cost
- `wallet_refund` — release hold on failure
- `wallet_credit` — admin / package top-up

These are the **only** way to mutate balance. Application code never updates the wallet table directly. Migrations: `drizzle/migrations/0001_wallet_functions.sql`.

Onboarding bonus: 100 tokens on first sign-in (`drizzle/migrations/0002_onboarding_bonus.sql`).

## Admin

`/admin` with 6 tabs: Overview, Users, Jobs, Transactions, Tools, Payments.

## Containers (prod)

`ai-hub-web` (Next.js :3010), `ai-hub-worker` (BullMQ consumer), `mailpit` (:8025 web for debug magic-link reads). Compose project name: `ai-hub`.

Compose file on prod currently lives at `/home/aisales/ai-hub/source/docker-compose.yml`. After monorepo consolidation it should be retargeted at `apps/ai-hub/docker-compose.yml` (TODO).

## Payments

Stripe Checkout (`src/lib/stripe.ts`) + Telegram Stars. See `TELEGRAM.md`.

## Local quickstart

```bash
cd apps/ai-hub && npm install && cp .env.example .env
# point DATABASE_URL at local PG; REDIS_URL at local redis; etc.
npm run db:push           # or run drizzle migrations
npm run dev               # web :3010
npm run worker            # in another shell
```

Full local walkthrough: `README.md` in this folder.

## Things not to touch without thinking

- Wallet table or wallet functions — direct SQL updates break invariants.
  Always go through `wallet_reserve / charge / refund / credit`.
- `drizzle/migrations/*` — write migrations forward-only. Don't rewrite shipped files.
- `src/lib/providers/adapters/*` — provider quirks; treat each adapter as a contract.
