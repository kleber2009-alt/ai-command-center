# Persona Studio

AI Identity / Content Studio. Полный конвейер личного контента:

**Research/Parser → Script → Avatar → Video → Montage → Schedule → Autopost.**

- **Research** — поиск вирусного контента по нише, метрики/viralScore, анализ роликов и авторов, хуки, папки/радары (Apify + Claude + Qdrant/Voyage).
- **Parser** — трендовые посты конкурентов → в работу одним кликом.
- **Avatar** — 1 фото → батч AI-аватаров (kie.ai: Flux Kontext / Nano Banana).
- **Video** — говорящее видео из аватара: HeyGen Avatar IV / ByteDance OmniHuman (+ ElevenLabs TTS).
- **Montage** — Submagic (субтитры, b-roll, шаблоны).
- **Cover / Carousel** — обложки и многослайдовые карусели.
- **Scheduler** — автопостинг в Instagram (Graph API) и Telegram.
- **Платформа** — Auth.js v5 (magic-link + Google + Telegram Mini App), биллинг CryptoBot + Telegram Stars, API-ключи + SDK, админка, i18n RU/EN.

Стек: Next.js 15 App Router + TS + Tailwind + Prisma (Postgres) + BullMQ (Redis,
9 воркеров) + S3 (MinIO/R2) + провайдеры (kie.ai, HeyGen, ElevenLabs, Submagic,
Apify, Anthropic, Voyage/Qdrant).

## Архитектура

```
persona-studio/
├── prisma/schema.prisma         # User / Upload / AvatarGeneration / Avatar / Cover / Video / TokenTransaction
├── src/
│   ├── app/
│   │   ├── (app)/               # auth-required routes
│   │   │   ├── dashboard/
│   │   │   ├── generate/        # upload → enqueue avatar batch
│   │   │   ├── avatars/         # grid + select + live poll
│   │   │   ├── covers/          # list + /new (cover-form preview live)
│   │   │   └── billing/         # token balance + dev-stub packs
│   │   ├── (auth)/sign-in/      # magic-link form (Auth.js v5)
│   │   └── api/                 # upload, generate-avatars, avatars/:id/select,
│   │                            # generate-cover, covers, billing/balance,
│   │                            # billing/buy-tokens (dev stub)
│   ├── lib/
│   │   ├── auth.ts              # NextAuth v5 + Nodemailer + Google
│   │   ├── prisma.ts
│   │   ├── storage.ts           # S3 client (MinIO / R2 / S3)
│   │   ├── gemini.ts            # Gemini Image API wrapper
│   │   ├── tokens.ts            # charge / refund / credit (atomic tx)
│   │   ├── queue.ts             # BullMQ queues (avatar + cover)
│   │   ├── styles.ts            # 10 avatar styles + prompt fragments
│   │   └── prompts.ts           # avatar + cover prompt builders
│   ├── workers/
│   │   ├── index.ts             # entrypoint (npm run worker)
│   │   ├── avatar-generation.worker.ts
│   │   └── cover-generation.worker.ts
│   └── components/
│       ├── nav.tsx
│       ├── upload-zone.tsx      # client — drop / upload / enqueue
│       ├── avatar-grid.tsx      # client — poll status, select
│       ├── cover-form.tsx       # client — live preview
│       └── billing-actions.tsx  # client — dev token packs
```

## Локальный запуск

### 0. Зависимости

Нужны:
- Node 20+
- Запущенный Postgres (можно использовать тот же `aisales-postgres`)
- Запущенный Redis (можно использовать тот же `aisales-redis`)
- Запущенный S3-совместимый storage (можно использовать тот же `aisales-minio`)
- Локальный SMTP для magic-link — `mailpit` уже крутится в `ai-hub` compose (:8025 web, :1025 SMTP)

### 1. Создать БД

В `aisales-postgres`:
```bash
docker exec aisales-postgres createdb -U aisales persona_studio
```

### 2. Установить deps и сгенерить prisma client

```bash
cd persona-studio
cp .env.example .env
# отредактировать .env: DATABASE_URL, S3_*, GEMINI_API_KEY, AUTH_SECRET (openssl rand -base64 32)
pnpm install                # или npm i
pnpm db:push                # создаст таблицы
```

### 3. Создать S3 bucket

В MinIO:
```bash
docker exec aisales-minio mc mb local/persona-studio-media
docker exec aisales-minio mc anonymous set download local/persona-studio-media
```

### 4. Запустить два процесса

В одной вкладке — web:
```bash
pnpm dev          # localhost:3020
```

В другой — worker:
```bash
pnpm worker       # tsx watch src/workers/index.ts
```

### 5. Войти

Открыть `http://localhost:3020`, ввести email → откроется mailpit (`http://localhost:8025`) с magic-link.

## Прод-деплой

Задеплоено: `persona-app.46-62-215-11.nip.io` (web :3020) + worker, CI —
`.github/workflows/deploy-persona-studio.yml` (push в `main`). Миграции
применяются baseline-aware скриптом `prisma/deploy.mjs` (см.
`prisma/migrations/README.md`). Раскладка:

1. БД `persona_studio` в `aisales-postgres` (тот же container).
2. Bucket `persona-studio-media` в `aisales-minio` (или Cloudflare R2 — поменять `S3_*` env).
3. Compose-проект `persona-studio` рядом с `ai-hub` (`docker-compose.yml` + `Dockerfile`).
4. Два контейнера: `persona-studio-web` (:3020) + `persona-studio-worker` (no port).
5. Caddy:
   - `persona.46-62-215-11.nip.io` → статика лендинга (`persona-studio-landing/`).
   - `persona-app.46-62-215-11.nip.io` → `persona-studio-web:3020`.

## Token costs (env-driven)

Калибровка под себестоимость провайдеров (~55% маржа на Pro) — см.
[`docs/UNIT_ECONOMICS.md`](docs/UNIT_ECONOMICS.md).

```
SIGNUP_BONUS_TOKENS=10
COST_AVATAR_GENERATION=10     # батч из 10 аватаров
COST_COVER_GENERATION=3
COST_SLIDE_IMAGE=3
COST_HEYGEN_VIDEO=100         # HeyGen Avatar IV
COST_OMNIHUMAN_VIDEO=140      # ByteDance OmniHuman + ElevenLabs TTS
COST_SUBMAGIC_EDIT=15
COST_RESEARCH_*=1..10         # transcribe / analyze / page-analyze / hooks / refresh
```

Возврат — автоматический: `failed` batch → полный возврат; `partial` batch →
пропорциональный (`floor(cost·failed/total)`); `failed` cover/video → полный.

## Production hardening (статус)

Сделано: явная `sharp`-зависимость; провайдерские ключи опциональны (прод
поднимается с одним KIE); версионированные prisma-миграции с baseline-aware
деплоем; rate-limiting дорогих эндпоинтов; consent + image-модерация (один
человеческий лик + SFW) перед батчем; репрайс видео в плюс; fail-closed
Telegram-вебхук; юнит-тесты денежного пути + smoke + CI. Источник истины по
задачам — Notion «Persona Studio — Production & First Client».

Осталось: Sentry (`@sentry/nextjs` + DSN); прод-SMTP (SPF/DKIM) для magic-link;
лимиты/watermark free-плана; браузерный E2E; (опц.) split воркеров.
