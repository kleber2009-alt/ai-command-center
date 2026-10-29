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
│   ├── ai-content-factory/ # Autonomous IG content factory (Claude + Puppeteer + RAG)
│   ├── ig-content/         # Next.js SaaS — Instagram Serial Content Automation (Supabase + 5 agents)
│   ├── funnel-analytics/   # Сквозная аналитика: декомпозиция × Meta Ads × оплаты UTM → static HTML dashboard
│   ├── hq-office/          # Живой офис агентов v2 (hq2.aicex.club): 3D + история реальных задач
│   ├── studio-kadrik/      # «Студия Кадрика» @studio_kadrik_bot: игровой мини-апп + монтаж скиллами (Python, aicex box)
│   ├── remake-site/        # «Ремейк залёта» (remake.aicex.club): прогоны скилла remake-top-reel + студия (референс → аватар → монтаж)
│   └── voice-circle-bot/   # Python TG bot for video circles
├── landings/               # static landing pages (one folder per product)
├── supabase/               # SQL migrations shared across apps
├── scripts/                # backup + deploy shell scripts
├── docs/                   # cross-product docs (TELEGRAM_MINI_APP, backup-restore)
├── assets/                 # landing assets (snapshots, demo.js)
└── .github/workflows/      # CI deploy workflows
```

## Product → path map

**Source of truth for product status** — Command Center dashboard:
`https://projects.aicex.club/dashboard` (API: `/api/projects` and `/api/projects/<slug>`). Its data comes from the
registry `apps/command-center/registry/projects.mjs` (all projects, domains, bots, links, architecture notes) —
edit it and run `node apps/command-center/registry/sync.mjs --apply` (or let `sync-projects-registry.yml` do it on merge).
**Full architecture map (servers, domains, bots, DBs, pipelines): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).**

> Prod moved to the aicex box `157.180.33.173` (`*.aicex.club`); the `46-62-215-11.nip.io` URLs below are legacy
> and no longer respond — use the `*.aicex.club` domains from `docs/ARCHITECTURE.md`.

| # | Product (slug) | Status | Milestones | Code path | Landing | Prod URL | Container(s) |
|---|---|---|---|---|---|---|---|
| 1 | 🏢 **AI Growth Office** (`ai-office`) | production | 10/13 | `apps/ai-office` | (own static) | `ai-office.46-62-215-11.nip.io`, `ai-office.46-62-215-11.nip.io` | `infra-ai-office-1` |
| 2 | 🎙️ **Транскрибация** (`transcribe`) | production | 10/12 | `apps/transcribe` | `landings/transcribe` | `transcribe.46-62-215-11.nip.io`, `tma.46-62-215-11.nip.io` | `infra-transcribe-1` |
| 3 | 🎬 **Reels Cloner** (`viral-clone`) | production | 8/10 | `apps/infra-worker/handlers/viral_clone.js` | `landings/viral-clone` | TG `/clone` в `@your_transscribe_bot` | `infra-aisales-worker-1` |
| 4 | 🎨 **AI Creative Hub** (`ai-hub`) | dev | 6/10 | `apps/ai-hub` | `landings/ai-hub` | `aihub.46-62-215-11.nip.io`, `aihub-app.46-62-215-11.nip.io`, TMA `@aicex_one_bot` | `ai-hub-web`, `ai-hub-worker`, `mailpit` |
| 5 | 🎤 **AI Voice Bot** (`voice-bot`) | production | 6/7 | `apps/ai-office/voice-bot/` (TBD: relocate) | (внутри ai-office) | `@aio_voice_bot`, `ai-office.46-62-215-11.nip.io/persona-train` | (in `infra-ai-office-1` или отдельный) |
| 6 | 📱 **AI Office Mini App** (`mini-app`) | dev | 4/6 | inside `apps/ai-office` (`/mini-app/`) | — | `ai-office.46-62-215-11.nip.io/mini-app/`, `@AI_Growth_Office_Bot/app` | `infra-ai-office-1` |
| 7 | 💼 **AI Sales System** (`ai-sales`) | production | 4/8 | `apps/ai-sales` | `landings/aisales`, `landings/aisales-system` | `aisales.46-62-215-11.nip.io`, `dashboard.46-62-215-11.nip.io` | `aisales-api-v2`, `aisales-command-center`, postgres/redis/qdrant/minio |
| 8 | 💬 **tg-agent** (`tg-agent`) | production | 5/7 | `apps/tg-agent` | `landings/tg-agent` | `tg-agent.46-62-215-11.nip.io`, `tg.46-62-215-11.nip.io` (admin), `@newnewnnn_bot` | `tg-agent` |
| 9 | 🪞 **Persona Studio** (`persona-studio`) | dev (hardening к GA) | 5/7 | `apps/persona-studio` | `landings/persona-studio` | `persona-app.46-62-215-11.nip.io` (web), `dashboard.../landings/persona-studio/` | `persona-studio-web`, `persona-studio-worker` |
| 10 | 📡 **Залётный / Viral Discover** (`viral-discover`) | production | **6/6 ✅** | `apps/infra-worker/handlers/viral_discover.js` + `lib/parser_bot.js` | `landings/viral-discover/cabinet/` | `dashboard.../landings/viral-discover/`, `parser.46-62-215-11.nip.io`, `@parser_instaa_bot` | `infra-aisales-worker-1` |
| 11 | 🏭 **AI Content Factory** (`ai-content-factory`) | dev | 3/6 | `apps/ai-content-factory` | `landings/ai-content-factory` | TG-доставка через бота владельца | `infra-ai-content-factory-1` (после деплоя) |
| 12 | 📸 **IG Serial Content** (`ig-content`) | production | 6/8 | `apps/ig-content` | (web-app сам = сайт) | `https://igcontent.46-62-215-11.nip.io` | `ig-content` (host port 3017) |

### Infrastructure-only apps (not in Command Center)

| Code path | Что | Prod |
|---|---|---|
| `apps/ytdlp` | FastAPI yt-dlp companion (URL → media) | `infra-ytdlp-1` |
| `apps/infra-worker` | Office Worker, 9 cron handlers (`daily_briefing`, `weekly_recap`, `monthly_calendar`, `welcome_sequence`, `welcome_voice`, `subscription_expiry_check`, `viral_clone`, `viral_clone_sweep`, `viral_discover`) | `infra-aisales-worker-1` |
| `apps/persona-train` | Forked voice-training stack (own domain) — **в Command Center НЕТ**, отдельная инициатива Ильи | `persona-train.46-62-215-11.nip.io`, `@ilia_pali0_bot`, `persona-train-web :3030` |
| `apps/funnel-analytics` | Сквозная аналитика + доходы/расходы + контент (Python stdlib → один HTML), cron-обновление через `update-funnel-analytics.yml` | `dashboard.aicex.club` (свой сервер, cron из `deploy/setup-server.sh`), `/var/www/funnel-analytics` |
| `apps/studio-kadrik` | «Студия Кадрика» `@studio_kadrik_bot`: игра + монтаж скиллами Creator Pack, оплата Stars — **в Command Center НЕТ** | `kadrik.aicex.club` (сервер `*.aicex.club`), systemd `studio-kadrik-bot` в `/home/iliapaliy/studio-kadrik-bot`, деплой `deploy-studio-kadrik.yml` |
| `apps/voice-circle-bot` | Python TG-bot prototype для видео-кружков — **в Command Center НЕТ**, не задеплоен | — |
| `apps/remake-site` | «Ремейк залёта»: страница прогонов скилла `remake-top-reel` (отбор → сценарий «было/стало» → аватар → монтаж) + API `/api/runs` и **студия** по паролю (`studio.mjs`: референс файлом или ссылкой → расшифровка ElevenLabs → «Сценарий 2.0» Claude с гейтом скилла → образ и голос из HeyGen → монтаж через API Студии Кадрика → скачать) + Telegram-ветка **«Instagram Reels»** (`reels-bot.mjs`: залёты конкурентов или свои → карточка с новым хуком → ✅ → HeyGen → монтаж → видео файлом) — **в Command Center НЕТ**. Вкладка прогонов — также артефакт claude.ai | `remake.aicex.club` (сервер `*.aicex.club`), контейнеры `aicex-remake-site` и `aicex-remake-api` (образ `aicex-remake-api:<релиз>`: node + ffmpeg + python3 + yt-dlp) + `/opt/edge/sites/remake-site.caddy`, деплой `deploy-remake-site.yml`, секреты `REMAKE_SITE_TOKEN`, `REMAKE_SITE_PASSWORD`, ключи HeyGen/ElevenLabs/Anthropic (`REMAKE_*` или существующие), ключ монтажа — из `.env` Кадрика на сервере; бот ветки — секрет `REMAKE_TG_BOT_TOKEN`; ветка **«Instagram Карусели»** (`carousel-bot.mjs`, скилл `carousel-pro`: карусель-залёты свои и конкурентов → план → ✅ → слайды альбомом) — секрет `CAROUSEL_TG_BOT_TOKEN` (бот «Карусель Pro») |
| `apps/hq-office` | Живой офис агентов v2: 3D open-space + история реальных задач с доказательствами (PR, артефакты Claude, сайты), досье и скиллы с hq.aicex.club — **в Command Center НЕТ** | `hq2.aicex.club` (сервер `*.aicex.club`), контейнеры `aicex-hq-office` (статика) и `aicex-hq-assistant` (голосовой ассистент + рабочий стол задач агентам, `/api/assistant/*`), служба `hq-runner` (исполнитель задач: Claude Code со скиллами под пользователем ботов) + `/opt/edge/sites/hq-office.caddy`, деплой `deploy-hq-office.yml`, история из PR — `hq-office-history.yml` |

## When Claude is asked to change something

- "fix / add / refactor in **transcribe**" → only touch `apps/transcribe/**`
- "feature in **ai-hub**" → only touch `apps/ai-hub/**`
- "feature in **ig-content**" → only touch `apps/ig-content/**` (standalone, не root workspace; `npm install` внутри директории)
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
| `ig-content` | `/root/ig-content-deploy/apps/ig-content/docker-compose.yml` (TBD retarget to `/root/ai-command-center/apps/ig-content/`) | `ig-content` (host port 3017) |

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
- [`apps/ai-content-factory/CLAUDE.md`](apps/ai-content-factory/CLAUDE.md) — TS/ESM, Claude + Voyage + sqlite-vec + Puppeteer carousel pipeline, Telegram delivery
- [`apps/ig-content/CLAUDE.md`](apps/ig-content/CLAUDE.md) — Next.js 14 + Supabase, 5 AI-agents (Strategist / Reels / Carousel / Analytics), pgvector RAG, port 3010, deploy `igcontent.46-62-215-11.nip.io`
- [`apps/voice-circle-bot/CLAUDE.md`](apps/voice-circle-bot/CLAUDE.md) — prototype, not in prod
- [`apps/hq-office/CLAUDE.md`](apps/hq-office/CLAUDE.md) — живой офис v2 (hq2.aicex.club): 3D-визуализация + история реальных задач (`tasks.js`), досье с hq.aicex.club, рабочий стол: задачи агентам из офиса (`assistant/desk.mjs` + `runner/`)
- [`apps/studio-kadrik/CLAUDE.md`](apps/studio-kadrik/CLAUDE.md) — «Студия Кадрика»: aiogram-бот + мини-апп, монтаж через Claude Code, Stars, деплой `deploy-studio-kadrik.yml` (вручную, check/deploy)
- [`apps/threads-growth/CLAUDE.md`](apps/threads-growth/CLAUDE.md) — AI Threads Growth Agent (FastAPI + pgvector + Claude + Apify + n8n): relative-virality scoring (xn), Reply Engine, warmup-ramp, similarity-gated rewrite, learning loop + воронка Threads → Telegram (`app/funnel`: 3 ветки/день карточками в TG, публикация через Threads API, перевыпуск победителей) — **WIP, не задеплоен**

Per-app `README.md` / `DEPLOY.md` / `ROADMAP.md` remain authoritative for deep architecture and deploy steps. Each `apps/<app>/CLAUDE.md` is the orientation layer.

## Project skills (`.claude/skills/`)

- `hq-history` — добавить задачу в историю живого офиса hq2.aicex.club.
- `remake-top-reel` — «Ремейк залёта»: топ-рилс Ильи (говорящая голова с кодовым словом) → расшифровка →
  усиленный и уникализированный сценарий → аватар HeyGen голосом Ильи → монтаж стилем «Студии Кадрика»
  (стекло / панель / бизнес-рилс). Скрипты stdlib-Python; на Mac ставится в `~/.claude/skills` и в каталог
  мини-аппа Кадрика через `kadrik/install.sh`. Прогоны видны на `remake.aicex.club` (`apps/remake-site`).
- `odna-storis` — «Одна сториз»: сторис 1080×1920 в формате самых конверсионных сторис Ильи (белые плашки поверх фото,
  «Кто хочет ГОТОВОЕ…», кодовое слово в ответ на сторис). Серия под запуск, фото с Google Диска, вставки работ агентов
  с hq2.aicex.club, рендер `scripts/render.mjs` (Playwright), цепочки ChatPlace.
- `carousel-pro` — «Карусель Pro»: карусели из залётов — свои вышедшие (ремикс слайдов с новой обложкой, хуком, CTA;
  объединяет `ilia-carousel-style`: `scripts/remix.py`, `assemble.py`) и конкурентов (формат и рабочие скриншоты, слайды в
  стиле Ильи). Правила для Claude — `references/carousel-rules.md`; в Telegram — ветка «Instagram Карусели» (`apps/remake-site/carousel-bot.mjs`).
