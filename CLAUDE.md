# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a self-hosted monorepo with two stacks:

- `/` — `ai-command-center`: Next.js 14 dashboard (TypeScript, Tailwind).
- `/ai-sales/` — `ai-sales-system`: FastAPI backend, agent prompts, content bank, SQL migrations, HTML prototypes, deploy scripts. Runs as `aisales-api` in Docker.

Both stacks share the same Postgres 16 instance (defined in `ai-sales/code/docker-compose.yml`). Caddy in front terminates HTTPS and routes `/api/sales/*` + `/webhooks/*` to FastAPI, everything else to Next.js.

**No Vercel, no Supabase.** Production is a Hetzner VPS running `docker compose` from `ai-sales/code/`.

## Commands

### Dashboard (Next.js, at repo root)

```bash
npm run dev      # Next.js dev server (default :3000)
npm run build    # production build (output: 'standalone' for Docker)
npm start        # serve the production build
npm run lint     # next lint
```

No test runner is configured for the Next.js side.

### Full stack (from ai-sales/code/)

```bash
docker compose up -d              # postgres, redis, qdrant, minio, api, dashboard, caddy
docker compose logs -f dashboard  # Next.js logs
docker compose logs -f api        # FastAPI logs
docker compose down               # stop everything (volumes survive)
```

## Required environment variables

### Dashboard (root `.env.local` for dev, container env for prod)

- `DATABASE_URL` — Postgres connection string. Dev (host): `postgresql://aisales:aisales_local_dev@127.0.0.1:5432/aisales`. Prod (inside compose): `postgresql://aisales:${POSTGRES_PASSWORD}@postgres:5432/aisales`.
- `ANTHROPIC_API_KEY` — used by `src/app/api/command/route.ts`. Without it, the route returns a single fallback task.

### Full stack (`ai-sales/code/.env`)

See `ai-sales/code/.env.example`. Notable additions for this setup:
- `POSTGRES_PASSWORD` — shared between postgres container and dashboard's `DATABASE_URL`.
- `DOMAIN` — used by Caddy. `localhost` for dev (self-signed); on the server, set to `46-62-215-11.nip.io` (or your real domain) for Let's Encrypt.

## Architecture

Next.js 14 App Router + React 18 + TypeScript + Tailwind. UI strings are Russian; comments/identifiers stay English. Path alias `@/* → src/*`. Dark mode is forced at the HTML root (`<html className="dark">` in `src/app/layout.tsx`); there is no light theme.

**Standalone output**: `next.config.js` sets `output: 'standalone'` so the Dockerfile can copy `.next/standalone/server.js` into a minimal alpine image (~150 MB final).

**Routing**: `src/app/page.tsx` redirects `/` → `/dashboard`. All authenticated-style pages live under the `(dashboard)` route group, which provides the fixed sidebar shell (`src/app/(dashboard)/layout.tsx`). The route group does not add a URL segment — pages render at `/dashboard`, `/team`, `/tasks`, etc.

**Page status**: Only `/dashboard` is implemented. `/team`, `/tasks`, `/metrics`, `/briefing`, `/settings` are placeholder stubs (`"В разработке"`). When asked to "build out X page", you are starting from an empty stub — use `dashboard/page.tsx` as the style reference (slate-800/50 cards with `border-slate-700/50`, JetBrains Mono for numerics, `animate-slide-in` wrapper).

**The dashboard cycle** (`src/app/(dashboard)/dashboard/page.tsx`):
1. On mount, `loadMetrics()` GETs `/api/metrics`. On failure it falls back to hardcoded demo data — don't remove this fallback unless the user explicitly asks.
2. "Запустить команду" button calls `runTeam()`, which loops through `AI_AGENTS` from `src/lib/agents.ts` **sequentially** (not in parallel) with an artificial 800–1400 ms delay per agent to animate the "thinking → done" states. Each iteration POSTs to `/api/command` and accumulates returned tasks into local state.

**Two API routes**:
- `GET /api/metrics` — server-side Postgres queries via the shared pool in `src/lib/db.ts`. Reads `platform_users`, `lesson_progress` (status='completed'), `platform_subscriptions` (status='active') and computes MRR from `PLAN_PRICES = { pro: 29, builder: 79, architect: 199 }`. Several outputs (`achieved`, `monthGoal`, `dailyNeeded`, `goalPercent`) are currently **hardcoded** — they are not yet derived from real data.
- `POST /api/command` — proxy to Anthropic Messages API (`claude-haiku-4-5-20251001`, `max_tokens: 300`). Request body is `{ agentId }`. The route picks a Russian prompt from `AGENT_PROMPTS` keyed by `agentId` and instructs the model to return **only** a JSON array of `{text, impact}`. The parser strips markdown fences before `JSON.parse` — keep that defense if you change the prompt.

**Dashboard tables** (created by `ai-sales/04-database/004_platform_metrics.sql`, seeded by `005_platform_seed.sql`):
- `platform_users(last_active: timestamptz, ...)` — "active 7d" filters `last_active > now()-7d`. Note: ai-sales has its own `users` table for system operators — these are different.
- `lesson_progress(status: text, ...)` — completion rate counts `status='completed'`, denominator is `users * 26` (constant `LESSONS_PER_USER` in `src/app/api/metrics/route.ts`). Update both if the curriculum changes.
- `platform_subscriptions(status: text, plan: 'pro'|'builder'|'architect')` — MRR is `$29/$79/$199` per active sub.

**DB connection pool**: `src/lib/db.ts` exports a single `pg.Pool` keyed off `DATABASE_URL`. It's cached on `global.__pgPool` in non-production to survive Next.js hot reloads.

**AI agent registry**: `src/lib/agents.ts` exports `AI_AGENTS` (id, emoji, name, role, color). The `id` is the contract between the registry, the prompt map in `/api/command`, and the agent-status state in the dashboard — keep them in sync when adding/removing agents.

## Deployment

The dashboard ships as a Docker container alongside the rest of the stack. Caddy (in `ai-sales/code/docker-compose.yml`) provides automatic HTTPS via Let's Encrypt and routes incoming requests:

| Path prefix | Service |
|---|---|
| `/api/sales/*` | FastAPI (`api:8000`), prefix stripped |
| `/webhooks/*` | FastAPI (Telegram/Instagram webhooks) |
| `/docs`, `/openapi.json` | FastAPI Swagger |
| everything else | Next.js dashboard (`dashboard:3000`) |

Deploy flow:
```bash
ssh aisales@46.62.215.11
cd ~/aisales              # or wherever the repo is cloned
git pull
cd ai-sales/code
docker compose build dashboard api
docker compose up -d
```

## Conventions

- Client-only React components must start with `'use client'`. The dashboard layout and page do; route handlers and `src/lib/db.ts` do not.
- Icons come from `lucide-react`; emojis are used as agent/category markers (kept in `AI_AGENTS` and the `BRIEFING` constant).
- The `BRIEFING` block on the dashboard is hardcoded demo content, not fetched. When wiring it to real data, replace the constant rather than reading from it.
- The model identifier `claude-haiku-4-5-20251001` is the production target; the version string visible in the sidebar footer (`claude-sonnet-4-6`) is cosmetic and out of sync — update both if you change models.
