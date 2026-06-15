# persona-studio — CLAUDE.md

AI Avatar Content Studio — 1 photo → 10 AI-avatars → HeyGen video or
viral carousel cover.

Next.js 15 App Router + TS + Tailwind + Prisma (Postgres) + BullMQ (Redis)
+ S3-compatible storage + Gemini Image API (Nano Banana 2).

Source-of-truth doc: `README.md` in this folder. Treat it as authoritative
for architecture, local setup, schema, and worker flow. This file is the
«what to read first» pointer + critical invariants.

## Commands

From repo root (npm workspaces):
```bash
npm run persona:dev          # web :3000 (or whatever PORT)
npm run persona:build && npm run persona:start
npm run persona:typecheck
npm run persona:worker:avatar    # avatar generation worker
npm run persona:worker:cover     # cover generation worker
```

Or from this app:
```bash
cd apps/persona-studio
pnpm install      # or npm install
pnpm db:push      # apply prisma schema
pnpm dev
```

## Stack

- Next.js 15 + App Router (uses route groups `(app)/`, `(auth)/`)
- Prisma + Postgres (can reuse `aisales-postgres`, db `persona_studio`)
- BullMQ + Redis (`aisales-redis`)
- S3 (MinIO `aisales-minio`, bucket `persona-studio-media` — local dev or own)
- Gemini Image API (`src/lib/gemini.ts`)
- NextAuth v5 + Nodemailer (magic-link via mailpit `:1025` in dev)
- Tailwind + shadcn/ui-style components

## Worker dispatch

Queues (all started together via `pnpm worker` / `pnpm worker:prod` — they share the same Prisma client and queue config as the web process):
- **avatar-generation** (`src/workers/avatar-generation.worker.ts`) — per upload, batch of N avatar styles, Gemini calls in parallel with concurrency cap.
- **cover-generation** (`src/workers/cover-generation.worker.ts`) — single cover per request with live preview.
- **heygen-video** / **omnihuman-video** — video render.
- **submagic-edit** (`src/workers/submagic-edit.worker.ts`) — отправляет готовое `VideoGeneration.videoUrl` в Submagic, ждёт рендер, заливает результат в MinIO в `VideoEdit.resultUrl`. Pipeline-шаг 4: Photo → Avatars → Video → **Montage**.

## Tokens — critical

Token balance changes go through `src/lib/tokens.ts` (`charge` / `refund` / `credit`), wrapped in a Prisma transaction. Don't update the user row's balance column directly anywhere else.

## Schema highlights (`prisma/schema.prisma`)

`User`, `Upload`, `AvatarGeneration`, `Avatar`, `Cover`, `VideoGeneration`, `VideoEdit` (Submagic-монтаж готового видео), `TokenTransaction`. Forward-only migrations via `prisma migrate`.

## Env

`.env.example` lists every key. Critical: `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`/`S3_BUCKET`/`S3_*`, `GEMINI_API_KEY`, `AUTH_SECRET` (`openssl rand -base64 32`). Optional: `SUBMAGIC_API_KEY` (без него `/edits` создание упадёт с `SUBMAGIC_NO_API_KEY`), `COST_SUBMAGIC_EDIT` (default 15).

## Deploy

`Dockerfile` (web) + `Dockerfile.worker` (worker). `docker-compose.yml` + `docker-compose.dev.yml` ship both. CI: `.github/workflows/deploy-persona-studio.yml` + `deploy-persona-landing.yml`.

## Research module (виральный ресёрч)

Модуль «Ресёрч вирусного контента» (ТЗ Badunga-уровня) живёт в:
- API: `src/app/api/research/**` (search, reels/:id +transcribe/translate/analyze/forge,
  authors/:id +analyze-page/refresh, folders, watchlist, favorites, hooks +generate,
  radars +run, export).
- Lib: `src/lib/research/**` (`metrics.ts` — медиана/виральность/ER/velocity/reach +
  перцентильный `viralScore`; `index-author.ts`, `expand-niche.ts`, `analyze*.ts`,
  `hooks-gen.ts`, `transcribe.ts`, `dedupe.ts`, `embeddings.ts`, `qdrant.ts`,
  `cache.ts`, `apify-budget.ts`, `run-radar.ts`, `niche-summary.ts`).
- UI: `src/app/(app)/research/**` + `src/components/research/**`.
- Cron: `src/workers/research-cron.worker.ts` (radar-sweep 15м, watchlist-sweep 60м).

Формулы метрик — в `metrics.ts`, считаются одинаково везде:
виральность=`views/medianViews` (0.1×), ER=`(likes+comments)/views*100` (репосты
исключены), velocity=`views/max(дней,0.5)`, reach=`views/followers`,
`viralScore`=`0.5·reach+0.2·ER+0.15·velocity+0.15·virality` перцентильно (без reach →
вес в virality). `lowConfidence` при <N рилсов.

### Принятые отклонения от буквы ТЗ (де-факто архитектура)

Функционально эквивалентны ТЗ, но реализованы на существующем стеке Persona Studio:

- **Семантический дедуп: Qdrant + Voyage вместо pgvector.** ТЗ просит pgvector в
  Postgres; реально — внешний Qdrant (`qdrant.ts`, cosine > 0.92) + эмбеддинги Voyage
  (`embeddings.ts`). Эмбеддинги в Prisma не хранятся. Если Qdrant/Voyage не настроены —
  остаётся дешёвый дедуп по `captionHash`.
- **Cron: BullMQ-воркер вместо n8n.** ТЗ описывает n8n для watchlist/radars; реально —
  `research-cron.worker.ts` на BullMQ/Redis. Те же задачи (radar-run, author-refresh).
- **Кредиты: `TokenTransaction` вместо `credit_ledger`.** Списания идут через
  `src/lib/tokens.ts` (`charge`/`refund`/`credit`), а не через отдельную таблицу.
- **`language`/`durationSec` рилса.** Apify не отдаёт язык; `language` определяется
  эвристикой по caption в `search/route.ts` (`detectLang`, доля кириллицы/латиницы).
  `durationSec` берётся из `videoDuration` Apify (`scoring.ts`); у рилсов, собранных до
  этого изменения, длительность `null` и фильтр «Длительность» их скрывает.

Фильтры выдачи (язык / тип / длительность) применяются клиент-сайд к уже полученной
выборке; период — серверным re-query (кэш-консистентность). См. `research-client.tsx`.

## Studio module (Мастер-ТЗ Persona Studio)

Сшивает research-слой с PRODUCE → PUBLISH → MEASURE. Раскатывается по спринтам
S1–S6. Спека пишет схемы в Postgres-схему `studio.*` и ссылается на `spy.reels`;
на нашем Prisma-стеке это обычные модели, ссылающиеся на `ResearchReel`.

**Уже есть в схеме (PUBLISH, Модули C/G):** `SocialAccount` (OAuth-каналы IG/TG,
токены AES-256-GCM), `ScheduledPost` + `PostTarget` (контент-план и фан-аут
автопубликации). API/воркеры публикации — см. `src/app/api/**` и sweep-воркер.

**S1 (готово) — фундамент:**
- **§2 Антиплагиат / провенанс.** `src/lib/studio/similarity.ts` — cosine между
  эмбеддингом сгенерированного текста и текстом источника (Voyage, тот же что в
  research-дедупе). Пороги `≥0.85 → block`, `0.75–0.85 → warn`, иначе `pass`.
  `recordProvenance()` пишет модель `Provenance`. Без `VOYAGE_API_KEY`/источника
  → `pass` с `reason`. Вызывается из S2-генерации сценария перед сохранением.
- **Модуль A · Persona.** Модель `Persona` (аватар + voiceId + brand + tone +
  isDefault). API `src/app/api/personas/**`. UI `src/app/(app)/personas/` +
  `src/components/persona/personas-client.tsx`. Sidebar «Create → Personas».
  Первая персона юзера всегда дефолтная; удаление дефолтной переносит флаг.
- Хелперы: `src/lib/studio/{types,persona,similarity}.ts`.

**S2 (дальше):** `Brief`/`Generation` связывают research-находку → Claude-сценарий
(net-new под персону) → **similarity-gate (готов)** → голос (ElevenLabs) → видео
(OmniHuman) → монтаж (Submagic) → `ScheduledPost`. Бóльшая часть PRODUCE-пайплайна
уже существует россыпью: `Avatar`, `VideoGeneration` (engine omnihuman + voiceId),
`VideoEdit`, `Cover`.

> Схема — declarative (`prisma db push`, без `migrations/`). Новые таблицы
> применяются `pnpm db:push` с воркстейшна или `docker compose exec web npx
> prisma db push` на проде.

## Landing

`/landings/persona-studio/` (static).
