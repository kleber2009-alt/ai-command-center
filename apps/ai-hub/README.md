# AI Creative Hub

> **Roadmap → [ROADMAP.md](./ROADMAP.md)** (канон). Этот README — стек, локальный запуск, архитектура.
> **Deep research → [docs/architecture-research.md](./docs/architecture-research.md)** — провайдерская стратегия,
> ledger-first wallet, pricing engine, security/GDPR, 6-month budget, mapping research → реализация.

Единый AI-кабинет: один баланс токенов, много нейросетей внутри (FLUX, Kling, Replicate, Runware, ModelsLab). Изолированный модуль в монорепо `aisales-app-v2`, не пересекается с `pages/`, `infra-worker/`, прод-БД `aisales`. **Лендинг live:** https://aihub.46-62-215-11.nip.io

**Стек (self-hosted, без managed-сервисов):**
- **Next.js 14** (App Router) + TypeScript
- **Postgres** — новая БД `ai_hub` внутри существующего `aisales-postgres` контейнера (уже бэкапится pg_backup pipeline'ом)
- **Drizzle ORM** — type-safe SQL, схема в TS — single source of truth
- **Auth.js v5** (NextAuth) — passwordless magic-link через SMTP
- **MinIO** (`aisales-minio`) — Storage через S3 SDK
- **BullMQ + Redis** — очередь задач (`aisales-redis`, БД 1)
- **Nodemailer** — отправка magic-link (Resend / Postmark / SES / любой SMTP)
- **Tailwind + shadcn/ui-style** components

## Структура

```
ai-hub/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/login/             # magic-link login (Auth.js)
│   │   ├── (app)/dashboard/          # protected: home
│   │   ├── (app)/tools/[slug]/       # protected: tool runner
│   │   ├── (app)/wallet/             # protected: balance + packages + tx log
│   │   ├── (app)/history/            # protected: job history
│   │   ├── api/auth/[...nextauth]/   # Auth.js endpoints
│   │   ├── api/wallet, wallet/transactions
│   │   ├── api/tools, tools/[slug]/run
│   │   ├── api/jobs, jobs/[id]
│   │   ├── api/webhooks/providers/[provider]/
│   │   ├── layout.tsx, page.tsx, globals.css
│   │   └── middleware.ts             # auth guard
│   ├── lib/
│   │   ├── db/                       # Drizzle schema + connection
│   │   ├── auth/                     # Auth.js v5 config
│   │   ├── auth-helpers.ts           # requireUser() для API routes
│   │   ├── email/                    # nodemailer wrapper
│   │   ├── storage/                  # MinIO S3 client + presigned URLs
│   │   ├── wallet/                   # reserve/charge/refund/credit
│   │   ├── providers/                # ProviderAdapter + router + adapters
│   │   │   └── adapters/fal.ts, replicate.ts, kling.ts, runware.ts, modelslab.ts, internal.ts
│   │   └── jobs/                     # BullMQ queue + worker
│   └── components/Header.tsx
├── drizzle/
│   ├── migrations/0000_init.sql      # все таблицы + индексы
│   ├── migrations/0001_wallet_functions.sql  # SECURITY DEFINER функции
│   └── seed/tools.sql                # 8 MVP tools + 4 token packages
├── scripts/migrate.ts, seed.ts       # tsx-запускаемые скрипты
├── drizzle.config.ts                 # для drizzle-kit (генерация миграций)
├── package.json, tsconfig.json, next.config.mjs, tailwind.config.ts
└── .env.example
```

## Локальный запуск

### 1. Зависимости

```bash
cd ai-hub
npm install
```

### 2. БД

Локально проще всего запустить отдельный Postgres:

```bash
docker run -d --name ai-hub-pg \
  -e POSTGRES_USER=aisales -e POSTGRES_PASSWORD=password -e POSTGRES_DB=ai_hub \
  -p 5432:5432 postgres:16
```

(На проде — создаём БД в существующем `aisales-postgres`; см. секцию «Деплой».)

### 3. Redis

```bash
docker run -d --name ai-hub-redis -p 6379:6379 redis:7-alpine
```

### 4. MinIO

```bash
docker run -d --name ai-hub-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin -e MINIO_ROOT_PASSWORD=adminadmin \
  minio/minio server /data --console-address ":9001"

# создать bucket
docker exec ai-hub-minio mc alias set local http://localhost:9000 admin adminadmin
docker exec ai-hub-minio mc mb local/ai-hub-media
```

(На проде — используем `aisales-minio`, заводим bucket `ai-hub-media`.)

### 5. SMTP

Для magic-link нужен SMTP. Самое простое — **Resend**:
1. Регистрация на resend.com → API key
2. `SMTP_URL=smtp://resend:re_xxxxxxxx@smtp.resend.com:587`
3. `SMTP_FROM="AI Hub <no-reply@yourdomain.com>"` — домен надо верифицировать в Resend

Альтернативы: Postmark, AWS SES, Mailgun — все дают SMTP URL.

Для **dev** без отправки реальных писем: запустить **Mailpit** (локальный SMTP-приёмник):
```bash
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
# SMTP_URL=smtp://localhost:1025
# UI: http://localhost:8025
```

### 6. Env

```bash
cp .env.example .env.local
# DATABASE_URL=postgres://aisales:password@localhost:5432/ai_hub
# AUTH_SECRET=$(openssl rand -base64 32)
# SMTP_URL=...
# S3_ENDPOINT=http://localhost:9000  S3_ACCESS_KEY=admin  S3_SECRET_KEY=adminadmin
# REDIS_URL=redis://localhost:6379
# FAL_KEY=... (один достаточно для MVP)
# PROVIDER_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

### 7. Миграции и seed

```bash
npm run db:migrate                   # tsx scripts/migrate.ts — применяет drizzle/migrations/*.sql
npm run db:seed                      # tsx scripts/seed.ts — drizzle/seed/*.sql
```

### 8. Запуск

В двух терминалах:

```bash
npm run dev                          # Next.js на http://localhost:3010
npm run worker                       # BullMQ worker
```

Открыть http://localhost:3010 → login по email → magic-link → `/dashboard`.

## Архитектура (что уже работает на Этапе 1)

### Токен-кошелёк

Ядро — четыре атомарные Postgres-функции (`drizzle/migrations/0001_wallet_functions.sql`):

- `wallet_reserve(user, amount, job, tool)` — `available → reserved`, бросает `INSUFFICIENT_FUNDS`
- `wallet_charge(user, amount, reserved, job, tool)` — снять reserved, partial refund разницы
- `wallet_refund(user, amount, job, tool)` — `reserved → available`
- `wallet_credit(user, amount, type, payment, desc)` — пополнение

Race-conditions исключены `UPDATE ... WHERE available >= amount RETURNING` (атомарный CAS в Postgres).

Триггер `on_user_created` автоматически создаёт пустой wallet при регистрации (Auth.js INSERT в `users`).

### Job-флоу

```
POST /api/tools/:slug/run
  → INSERT ai_jobs (status=pending)
  → wallet_reserve            ──INSUFFICIENT_FUNDS──→ 402
  → status=queued
  → BullMQ.add(jobId)
  ↓
Worker (npm run worker)
  → status=processing
  → ProviderAdapter.submit({model, input, webhookUrl})
  → сохранить provider_job_id
  ↓
[async] Provider → POST /api/webhooks/providers/:provider?jobId=...
  → ProviderAdapter.parseWebhook (HMAC verify)
  → success: wallet_charge + status=completed + (TODO) media ingest в MinIO
  → failure: wallet_refund + status=refunded
```

Идемпотентность: `idempotencyKey` в теле — повторный запрос вернёт существующий job (uniq index `ai_jobs_idem_idx`).

### Provider abstraction

`src/lib/providers/types.ts` определяет `ProviderAdapter` (submit / getStatus / parseWebhook / cancel). Router (`router.ts`) — статический map. Fallback-цепочки и A/B — следующие этапы.

- **fal.ai** — реализован (queue API + webhook через `fal_webhook` query param + HMAC SHA-256)
- **Replicate** — реализован (predictions API + Standard Webhooks signature `whsec_...`, поддержка `owner/name` и `owner/name:version`)
- **kling / runware / modelslab / internal** — заглушки, кидают `NOT_IMPLEMENTED`

Per-provider webhook secrets — каждый провайдер подписывает по-своему, env-переменные раздельные: `FAL_WEBHOOK_SECRET`, `REPLICATE_WEBHOOK_SECRET` и т.д. Резолвятся через `src/lib/providers/secrets.ts`.

### MinIO storage

`src/lib/storage/index.ts`:
- `putObject(key, buf, mime)` — загрузка
- `presignGet(key, ttl)` — signed URL для отдачи юзеру
- `presignPut(key, mime, ttl)` — для direct browser upload
- `ingestFromUrl(url, key)` — скачать у провайдера и положить к себе

Bucket — `ai-hub-media` (path-style для MinIO compat).

### Media ingest

`src/lib/jobs/ingest.ts` — после успешной задачи:
1. `extractMediaUrls(output)` обходит JSON провайдера и собирает http(s)-ссылки на медиа (по расширениям файлов — `.jpg/.png/.webp/.mp4/.mov/.mp3/...`)
2. Каждый URL скачивается и кладётся в MinIO под ключ `users/<userId>/jobs/<jobId>/<idx>-<rand>.<ext>`
3. В `media_assets` пишется строка с `storagePath`, `type`, `mime_type`, `size_bytes`

Best-effort: если ingest упал — задача всё равно `completed`, raw URL остаётся в `ai_jobs.output`. Подключено как в webhook handler'е (async-flow), так и в воркере (sync-complete).

Юзеру медиа отдаётся через presigned URLs (TTL 1 час) на `/api/jobs/:id` (включает `media[]`), `/api/media`, `/api/media/:id`. Страница `/gallery` показывает grid всех его генераций.

## Что НЕ сделано (следующие этапы)

| Этап | Статус | Что добавить |
|---|---|---|
| 1. Foundation | ✅ | — |
| 2. Каталог + история UI | ✅ базовый | улучшить дизайн, добавить preview результатов |
| 3. Token Wallet | ✅ | — |
| 4. Provider Router | ✅ базовый | fallback-цепочки, A/B, dual-run для качества |
| 5. Первые tools | ✅ | fal (3 модели) + Replicate (upscale, face-swap) реальные; media ingest → MinIO + media_assets; галерея. Осталось: Zod-валидация input на сервере |
| 6. Видео | ✅ | Kling 1.6 через `fal-ai/kling-video/v1.6/standard/{image,text}-to-video` — без отдельного JWT-адаптера. Тот же webhook-flow что у image |
| 7. Payments | ✅ | Stripe Checkout + webhook + welcome bonus + **двойная идемпотентность** (webhook_events.event_id UNIQUE + payments.status check). Промокоды + RU-платежи (Telegram Stars) — backlog Stage 2 |
| 8. Error handling | 🟡 | retries (BullMQ attempts), timeout watchdog, dead-letter |
| 9. Admin panel | ❌ | `/admin` под `users.role='admin'`, редактирование tools/packages, ручные refunds |

## Деплой на Hetzner (план)

Цель — лечь в существующую инфру (см. корневой `CLAUDE.md`):

### 1. БД в существующем контейнере

```bash
ssh prod
# создать базу и роль для приложения
docker exec aisales-postgres psql -U aisales -c "CREATE DATABASE ai_hub;"
docker exec aisales-postgres psql -U aisales -d ai_hub -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

`pg_backup.sh` уже дампит инстанс целиком — новая БД попадёт в бэкапы автоматически без правок. **Проверить:** надо ли явно перечислить БД в `pg_backup.sh` или скрипт дампит кластер целиком (`-A` / `--all`). Если каждая БД отдельным `pg_dump` — добавить `ai_hub` в список.

### 2. MinIO bucket

```bash
docker exec aisales-minio mc mb local/ai-hub-media
docker exec aisales-minio mc anonymous set none local/ai-hub-media   # private
```

`aux_backup.sh` пока MinIO bucket не бэкапит — это **отдельный gap**. Решения:
- А) добавить `mc mirror local/ai-hub-media /backups/ai-hub-media/` в `aux_backup`
- Б) включить bucket replication MinIO → отдельный объектный storage (например, Hetzner Object Storage)
- В) забить, считать что MinIO single-node enough (рискованно для прода)

### 3. Compose-проект `ai-hub`

`/root/ai-command-center/apps/ai-hub/docker-compose.yml`:
- `ai-hub-web` — Next.js на 3010
- `ai-hub-worker` — тот же образ, entrypoint `node dist/worker.js`
- `ai-hub-redis` — опционально отдельный (или reuse `aisales-redis` БД 1)

Сеть — bridge с `aisales-postgres` и `aisales-minio` (как `tg-agent` ходит в `aisales-postgres` сейчас).

### 4. Caddy

В `/etc/caddy/Caddyfile` добавить блок:

```
aihub.46-62-215-11.nip.io {
  reverse_proxy ai-hub-web:3010
}
```

### 5. SMTP в проде

Resend / SES / Postmark — managed, не хочется ставить свой MX. Один env var, никаких контейнеров.

### 6. Webhook от провайдеров

`PROVIDER_WEBHOOK_BASE_URL=https://aihub.46-62-215-11.nip.io` — fal/Replicate/Kling будут писать сюда. Реальный домен (вместо nip.io) — когда будет, можно поменять без редеплоя кода.

## Безопасность

- API-ключи провайдеров — только в `.env`, никогда не отдаём в браузер
- Все вызовы внешних AI — только из API routes / worker'а
- Auth.js sessions хранятся в `sessions` таблице (database strategy), не JWT — можно отозвать
- Все мутации кошелька — через `SECURITY DEFINER` функции; даже если кто-то прорвётся к DB-коннекту, не сможет писать в `token_wallets` напрямую
- Webhook подписи проверяются HMAC + `timingSafeEqual`
- Идемпотентность: webhook повторно не списывает (проверка `job.status` уже finalized)

## Совместимость с монорепо

- Свой `package.json`, свои `node_modules` (изолировано)
- Не импортит из `pages/`, `infra-worker/`, `voice-circle-bot/` и пр.
- Свой dev-порт 3010 (не конфликтует с прод-API на 8001/8000)
- Своя БД (`ai_hub`), отдельная от `aisales`

Можно запускать параллельно с любым другим сервисом репо.
