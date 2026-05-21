# CLAUDE.md

Navigation index for the consolidated monorepo. For app-specific architecture,
env vars, and routes, see `CLAUDE.md` / `README.md` inside each `apps/<app>/`.

## Repo layout

```
/
├── apps/                   # all production applications
│   ├── transcribe/         # Next.js + Telegram Mini App — flagship transcription
│   ├── tg-agent/           # Node TG group agent (classifier + responder)
│   ├── ytdlp/              # FastAPI + yt-dlp companion microservice
│   ├── ai-sales/           # Multi-agent IG+TG sales (FastAPI + LangGraph + Caddy)
│   ├── ai-office/          # AI Growth Office static site
│   ├── ai-hub/             # SaaS aggregator of NN tools + token wallet
│   ├── persona-studio/     # Avatar / cover generation (Gemini + workers)
│   ├── persona-train/      # WIP — persona training
│   ├── infra-worker/       # cron+queue Office Worker (9 handlers)
│   └── voice-circle-bot/   # Python TG bot for video circles
├── landings/               # static landing pages (one folder per product)
├── supabase/               # SQL migrations shared across apps
├── scripts/                # backup + deploy shell scripts
├── docs/                   # cross-product docs (TELEGRAM_MINI_APP, backup-restore)
├── assets/                 # landing assets (snapshots, demo.js)
└── .github/workflows/      # CI deploy workflows
```

## Product → path map

| Product | Code path | Landing | Prod URL | Container(s) |
|---|---|---|---|---|
| Transcribe | `apps/transcribe` | `landings/transcribe` | `transcribe.46-62-215-11.nip.io` · `tma.46-62-215-11.nip.io` (TMA) | `infra-transcribe-1` |
| TG agent | `apps/tg-agent` | `landings/tg-agent` | — (TG groups, admin :8080) | `tg-agent` |
| yt-dlp | `apps/ytdlp` | — | internal :8000 | `infra-ytdlp-1` |
| AI Sales | `apps/ai-sales` | `landings/aisales`, `landings/aisales-system` | `dashboard.46-62-215-11.nip.io` | `aisales-api-v2`, `aisales-command-center`, `aisales-postgres`, `aisales-redis`, `aisales-qdrant`, `aisales-minio` |
| AI Growth Office | `apps/ai-office` | — (own static) | `ai-office.46-62-215-11.nip.io` | `infra-ai-office-1` |
| AI Hub | `apps/ai-hub` | `landings/ai-hub` | `aihub.46-62-215-11.nip.io` (landing) · `aihub-app.46-62-215-11.nip.io` (app) | `ai-hub-web`, `ai-hub-worker`, `mailpit` |
| Persona Studio | `apps/persona-studio` | `landings/persona-studio` | (deploy via `deploy-persona-studio.yml` / `deploy-persona-landing.yml`) | (TBD) |
| Persona Train | `apps/persona-train` | — | WIP | (TBD) |
| Office Worker | `apps/infra-worker` | — | webhooks :3000 | `infra-aisales-worker-1` |
| Voice Circle Bot | `apps/voice-circle-bot` | — | — | (manual) |
| Viral Clone (pipeline) | inside `apps/infra-worker` (handler `viral_clone`) | `landings/viral-clone` | trigger: `POST /worker/viral-clone/dispatch` | `infra-aisales-worker-1` |
| Viral Discover | inside `apps/infra-worker` (handler `viral_discover`) | `landings/viral-discover` | cron `05:00 daily` | `infra-aisales-worker-1` |
| **Парсер** (Parser bot) | `apps/infra-worker/lib/parser_bot.js` + handler `viral_discover` | `landings/viral-discover/cabinet/` | `parser.46-62-215-11.nip.io` (cabinet) + TG bot | `infra-aisales-worker-1` |

## When Claude is asked to change something

- "fix / add / refactor in **transcribe**" → only touch `apps/transcribe/**`
- "feature in **ai-hub**" → only touch `apps/ai-hub/**`
- "**landing** for X" → only touch `landings/X/**`
- "deploy workflow for X" → `.github/workflows/`
- Prod backup / restore questions → `docs/backup-restore.md`
- Shared types / utils have **no** central package yet — copy or factor into
  the consumer's `lib/`.

## Commands

Root `package.json` proxies into the node workspaces (`transcribe`, `tg-agent`,
`persona-studio`):

```bash
npm run dev                            # transcribe dev :3000
npm run build && npm start             # transcribe prod build
npm run lint
npm run tg-agent:{dev,build,start,typecheck}
npm run persona:{dev,build,start,typecheck}
npm run persona:worker:{avatar,cover}
```

For ai-hub / infra-worker / persona-train / voice-circle-bot / ai-sales —
`cd apps/<app>` and use its own scripts (Docker / Python / standalone).

## Prod infrastructure

- Single Hetzner box, IP `46.62.215.11`, Caddy + nip.io.
- Source of truth for domains: `/etc/caddy/Caddyfile` on prod.
- **5 docker-compose projects** (label `com.docker.compose.project`):

| Project | Compose file (on prod) | Containers |
|---|---|---|
| `infra` | `/root/ai-command-center/infra/docker-compose.yml` (+ `docker-compose.override.yml`) | `infra-transcribe-1`, `infra-ytdlp-1`, `infra-ai-office-1`, `infra-postgres-1`, `infra-aisales-worker-1` |
| `aisales` | `/root/ai-command-center/apps/ai-sales/docker-compose.yml` | `aisales-command-center`, `aisales-postgres`, `aisales-redis`, `aisales-qdrant`, `aisales-minio` |
| `aisales-v2` | `/home/aisales/aisales-v2-compose/docker-compose.yml` | `aisales-api-v2` |
| `tg-agent` | `/root/ai-command-center/apps/tg-agent/docker-compose.yml` | `tg-agent` |
| `ai-hub` | `/home/aisales/ai-hub/source/docker-compose.yml` | `ai-hub-web`, `ai-hub-worker`, `mailpit` |

> **Note**: after this monorepo consolidation, the prod paths for `ai-hub`
> and `aisales-v2` should be retargeted at `/root/ai-command-center/apps/ai-hub`
> and `/root/ai-command-center/apps/ai-sales-v2`. Until that's done, treat
> those prod paths as the source of truth.

## Databases

Two independent Postgres instances:

- **`aisales-postgres`** — databases:
  - `aisales` (AI Sales System + AI Growth Office + Office Worker)
  - `ai_hub` (AI Hub)
- **`infra-postgres-1`** — database `aio` (Transcribe).

Users on `aisales` DB:
- `claude_ro` — read-only, local socket (no password through `docker exec`).
- `aisales` — superuser, RW. **Any write requires explicit user approval.**

Common commands:
```bash
ssh prod 'docker exec aisales-postgres psql -U claude_ro -d aisales -c "<SELECT>"'
ssh prod 'docker exec aisales-postgres psql -U claude_ro -d ai_hub  -c "<SELECT>"'
ssh prod 'docker exec infra-postgres-1  psql -U aio       -d aio    -c "<SELECT>"'
```

## Production work modes

**Diagnostic** (`посмотри почему X не работает`): investigate → hypothesis
→ proposed diff/command (do NOT execute) → wait for approval → apply +
verify → if broken, revert from `.bak` and report.

**Autonomous** (`посмотри, исправь, скажи когда готово`): skip the
proposed-diff/approval step. Backup configs before any edit
(`cp config.yml config.yml.bak.$(date +%Y%m%d_%H%M%S)`, keep ≥7 days).
Each action explicit in the reply. Two failed attempts → stop, report.

## Always require explicit user approval

- Any write to `aisales` DB (INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER/migrations).
- `docker stop|rm|restart|kill`.
- Any action that changes prod state (pushing to remote, force-push, deploys
  that aren't routine).

## Backups (TL;DR)

Two pipelines, both run as `aisales` user, both write to MinIO (30-day lifecycle)
plus a 7-day local copy.

| Pipeline | What | Destination | When | Script |
|---|---|---|---|---|
| `pg_backup` | `pg_dump --format=custom` of `aisales` | MinIO `aisales-postgres-backups` | 03:17 UTC | `/home/aisales/scripts/pg_backup.sh` |
| `aux_backup` | `aio` db dump + SQLite (`tg-agent`, `transcribe`) + voice_notes volume | MinIO `aisales-aux-backups` | 03:40 UTC | `scripts/aux_backup.sh` (in this repo) |

Open gaps: `pg_backup` coverage of `ai_hub` db, and MinIO `ai-hub-media` bucket
not covered by `aux_backup`. Full restore runbook: `docs/backup-restore.md`.

## Production models

| Use | Model |
|---|---|
| `transcribe` content gen (`/api/transcribe/{summarize,translate,generate}`) | `claude-haiku-4-5-20251001` |
| `tg-agent` classifier + responder | `claude-haiku-4-5-20251001` |
| `/api/me/chat`, `/api/assistants/chat` (transcribe) | `claude-sonnet-4-6` |
| `ai-hub`, `persona-studio`, `ai-sales` | per provider config in each app |

## Conventions

- Client-only React components start with `'use client'`.
- UI strings in Russian, code identifiers / comments in English.
- Icons: `lucide-react`. No emojis in UI.
- Apps under workspaces (`transcribe`, `tg-agent`, `persona-studio`) share
  root `node_modules`. Others are standalone (own `package.json`, Dockerfile,
  env).
- `.env*.local` and `.env` files never commit.

## Detailed sub-docs

When the task is scoped to a single app, read its `CLAUDE.md` first:

- [`apps/transcribe/CLAUDE.md`](apps/transcribe/CLAUDE.md) — flow, API routes, `/me` RAG, `/admin`, security, Telegram Mini App
- [`apps/tg-agent/CLAUDE.md`](apps/tg-agent/CLAUDE.md) — pipeline, classifier, decision engine, responder, CRM, admin panel
- [`apps/ai-sales/CLAUDE.md`](apps/ai-sales/CLAUDE.md) — 4 agents, Caddy mounts, FastAPI + LangGraph + seed-fixture invariant
- [`apps/ai-hub/CLAUDE.md`](apps/ai-hub/CLAUDE.md) — wallet `SECURITY DEFINER` functions, providers, BullMQ, Auth.js
- [`apps/persona-studio/CLAUDE.md`](apps/persona-studio/CLAUDE.md) — avatar / cover workers, BullMQ, Gemini, route groups
- [`apps/persona-train/CLAUDE.md`](apps/persona-train/CLAUDE.md) — voice clone (ElevenLabs IVC) + avatar samples, shared `voices` table
- [`apps/infra-worker/CLAUDE.md`](apps/infra-worker/CLAUDE.md) — 9 cron handlers, `FOR UPDATE SKIP LOCKED`, docker build flags
- [`apps/ai-office/CLAUDE.md`](apps/ai-office/CLAUDE.md) — legacy marketing + persona-train voice endpoints (Netlify Functions)
- [`apps/ytdlp/CLAUDE.md`](apps/ytdlp/CLAUDE.md) — `POST /extract` companion service
- [`apps/voice-circle-bot/CLAUDE.md`](apps/voice-circle-bot/CLAUDE.md) — prototype, not in prod

Per-app `README.md` / `DEPLOY.md` / `ROADMAP.md` remain authoritative for deep architecture and deploy steps. Each `apps/<app>/CLAUDE.md` is the orientation layer.
