# AI Creative Hub · Roadmap

> Канон. Если запись здесь и в README расходятся — этот файл главный.
> Live URL: https://aihub.46-62-215-11.nip.io (пока только landing)
>
> **Deep architecture reference:** [docs/architecture-research.md](docs/architecture-research.md) — 700+ строк
> детального research-плана (провайдерская стратегия, ledger-first wallet, pricing engine,
> fallback chains, security, GDPR/AI Act, бюджет на 6 месяцев, mapping research → текущая реализация).

## Видение

Единый AI-кабинет для создателей контента. Один баланс токенов → много нейросетей. Self-host на Hetzner, без managed-сервисов.

**Дифференциация:** не «ещё один Midjourney», а **агрегатор**. Юзер платит один раз, генерирует через 5+ провайдеров (fal, Replicate, Kling, Runware, ModelsLab) с одного дашборда.

---

## Статусная шкала

| Метка | Что значит |
|---|---|
| ✅ Done | Готово в коде, протестировано локально или на staging |
| 🟡 In progress | Активная работа, частично готово |
| 🟦 Next | Следующее на очередь, спека готова |
| ⏳ Backlog | Запланировано, спеки нет |
| ❌ Blocked | Заблокировано (внешняя зависимость, нужно решение) |

---

## Этапы

### Этап 1 · Foundation · ✅ Done

| Что | Статус |
|---|---|
| Next.js 14 (App Router) + TS + Tailwind | ✅ |
| Postgres + Drizzle ORM (9 таблиц) | ✅ |
| 4 атомарные wallet-функции (`reserve/charge/refund/credit`) | ✅ |
| Auth.js v5 + magic-link через SMTP | ✅ |
| MinIO (S3 SDK + presigned URLs) | ✅ |
| BullMQ + Redis | ✅ |
| Миграции (`drizzle/migrations/*.sql`) + seed-скрипт | ✅ |
| Базовый UI: landing + login + dashboard + tools + wallet + history | ✅ |

### Этап 2 · UI · 🟡 In progress

| Что | Статус |
|---|---|
| Apple-style лендинг (`ai-hub-landing/`) | ✅ |
| Каталог tools по категориям | ✅ |
| Страница инструмента с дженерик-runner'ом (рендер из `input_schema`) | ✅ |
| Wallet UI (balance + transactions + packages) | ✅ |
| History UI | ✅ |
| Galllery UI (grid из MinIO presigned URLs) | ✅ |
| Polished design components (shadcn-style) | ⏳ Backlog |
| Mobile responsive review | ⏳ Backlog |
| Onboarding-флоу для новых юзеров | ⏳ Backlog |

### Этап 3 · Token Wallet · ✅ Done

| Что | Статус |
|---|---|
| Атомарный reserve через `UPDATE ... WHERE available >= amount RETURNING` | ✅ |
| Partial charge с auto-refund разницы | ✅ |
| Idempotent webhook (проверка `job.status` уже finalized) | ✅ |
| Auto-create wallet trigger при INSERT в `users` | ✅ |
| Append-only ledger `token_transactions` для аудита | ✅ |
| Onboarding bonus (стартовые токены при регистрации) | 🟦 Next |

### Этап 4 · Provider Router · ✅ Done · базовый

| Что | Статус |
|---|---|
| `ProviderAdapter` interface (submit/getStatus/parseWebhook/cancel) | ✅ |
| Router-map provider → adapter | ✅ |
| Per-provider webhook-секреты в env | ✅ |
| Fallback-цепочки (provider A fails → try B) | ⏳ Backlog |
| A/B-тестирование качества двух провайдеров на одной задаче | ⏳ Backlog |
| Cost-based routing (cheapest first) | ⏳ Backlog |

### Этап 5 · Первые tools · ✅ Done · 13 моделей

**Топ-3 флагманские связки** (выделены на лендинге):
1. **Kling Video** — Standard (1.6) + Pro (2.1 Master) — image/text → video
2. **Nano Banana** — Google Gemini 2.5 Flash Image — text → image + edit (SOTA с Aug 2025)
3. **Upscale** — Real-ESRGAN Standard + Clarity Upscaler Pro

**Полный каталог:**

| Tool | Tier | Provider | Model | Cost | Status |
|---|---|---|---|---|---|
| `nano-banana` | Gen | fal.ai | `fal-ai/nano-banana` | 10 | ✅ Live |
| `nano-banana-edit` | Edit | fal.ai | `fal-ai/nano-banana/edit` | 12 | ✅ Live |
| `text-to-image` | STD | fal.ai | `fal-ai/flux/dev` | 5 | ✅ Live |
| `image-edit` | STD | fal.ai | `fal-ai/flux-pro/kontext` | 8 | ✅ Live |
| `image-upscale` | STD | Replicate | `nightmareai/real-esrgan` | 3 | ✅ Live |
| `image-upscale-pro` | **PRO** | Replicate | `philz1337x/clarity-upscaler` | 8 | ✅ Live |
| `background-remove` | Util | fal.ai | `fal-ai/birefnet/v2` | 2 | ✅ Live |
| `face-swap` | — | Replicate | `cdingram/face-swap` | 10 | ✅ Live |
| `image-to-video` | STD | fal.ai | `fal-ai/kling-video/v1.6/standard/image-to-video` | 80 | ✅ Live |
| `image-to-video-pro` | **PRO** | fal.ai | `fal-ai/kling-video/v2.1/master/image-to-video` | 220 | ✅ Live |
| `text-to-video` | STD | fal.ai | `fal-ai/kling-video/v1.6/standard/text-to-video` | 100 | ✅ Live |
| `text-to-video-pro` | **PRO** | fal.ai | `fal-ai/kling-video/v2.1/master/text-to-video` | 250 | ✅ Live |
| `reels-script` | — | internal (Claude) | `claude-sonnet-4-6` | 4 | ⏳ Этап 8+ |

Плюс инфра:
- ✅ Media ingest в MinIO (`ingestJobMedia`)
- ✅ Presigned URLs для отдачи юзеру
- ✅ HMAC + Standard Webhooks signature verification

### Этап 6 · Video tools · 🟡 In progress

**Решение:** идём через fal.ai (там есть Kling 1.6 standard), не пилим отдельный Kling-адаптер с JWT-auth.

| Что | Статус |
|---|---|
| Routing: `image-to-video`/`text-to-video` на fal Kling 1.6 | 🟡 |
| Webhook flow работает (через существующий fal adapter) | 🟡 |
| Прогресс-бар в UI для долгих задач (>30 sec) | ⏳ |
| Запасной direct Kling-адаптер (JWT) | ⏳ Backlog · если fal upcharges |
| Polling-логика для провайдеров без webhook | ⏳ Backlog · понадобится для Runware/ModelsLab |

### Этап 7 · Payments · 🟡 In progress

| Что | Статус |
|---|---|
| Stripe Checkout endpoint `/api/checkout` | 🟡 |
| Webhook `/api/webhooks/stripe` (verify + credit) | 🟡 |
| Рабочая кнопка «Купить» на `/wallet` | 🟡 |
| 4 пакета в БД (Starter / Creator / Pro / Studio) | ✅ |
| Идемпотентность (Stripe event_id) | 🟦 Next |
| Промокоды + redemptions | ⏳ |
| Onboarding bonus 100 токенов при первой регистрации | 🟦 Next |
| RU-платежи (ЮKassa / CloudPayments / Stars) | ❌ Blocked · Stripe не работает для RU |

**Грабли (учтены):**
- Stripe не для RU физлиц → дублируем на ЮKassa или Telegram Stars (как в transcribe)
- Идемпотентность критична — webhook может приходить 2 раза
- Курс USD→RUB в UI — динамический не делаем, фиксируем

### Этап 8 · Error handling + observability · ✅ Done · базовый

| Что | Статус | Где |
|---|---|---|
| Watchdog для stuck jobs >15 min | ✅ | [src/lib/jobs/watchdog.ts](src/lib/jobs/watchdog.ts) — sweep loop в worker process |
| Healthcheck endpoint `/api/health` | ✅ | DB ping + Redis ping, 200 / 503, JSON response |
| Rate limit per user (max 5 concurrent jobs) | ✅ | [src/lib/jobs/rate-limit.ts](src/lib/jobs/rate-limit.ts), 429 на превышении |
| Structured logger (JSON to stdout) | ✅ | [src/lib/logger.ts](src/lib/logger.ts), LOG_LEVEL env, child(scope) |
| BullMQ retries с exp backoff | ⏳ | Намеренно skip — duplicate provider submit опасен. Watchdog покрывает stuck |
| Sentry / external monitoring | ⏳ | По желанию — подключается через `@sentry/nextjs` в logger.ts |
| Email-уведомления о завершении видео | ⏳ | Backlog · нужен в основном для долгих видео-jobs |

### Этап 9 · Admin panel · ✅ Done

| Что | Статус | Где |
|---|---|---|
| Role guard middleware + admin-guard helper | ✅ | [src/lib/admin-guard.ts](src/lib/admin-guard.ts) — `requireAdminPage` / `requireAdminApi` |
| `/admin` Overview · users / wallets / 24h jobs / revenue / GMV | ✅ | [src/app/admin/page.tsx](src/app/admin/page.tsx) |
| `/admin/users` · список + grant-tokens inline | ✅ | [src/app/admin/users/](src/app/admin/users/) |
| `/admin/jobs` · фильтр по status + manual refund | ✅ | [src/app/admin/jobs/](src/app/admin/jobs/) |
| `/admin/tools` · status toggle + tokenCost edit | ✅ | [src/app/admin/tools/](src/app/admin/tools/) |
| `/admin/payments` · все платежи + статусы | ✅ | [src/app/admin/payments/page.tsx](src/app/admin/payments/page.tsx) |
| API: refund, patch-tool, grant-tokens | ✅ | `/api/admin/jobs/[id]/refund`, `/api/admin/tools/[id]`, `/api/admin/users/[id]/grant-tokens` |
| Admin-таб в Header (виден только для role='admin') | ✅ | [src/components/Header.tsx](src/components/Header.tsx) |
| Provider P&L по моделям (cost_usd vs charged) | ⏳ Backlog | Поле `provider_cost_usd` уже есть в `ai_jobs`, нужна aggregation query |

### Этап 10 · Production deploy · 🟡 Готова инфра + build валидирован, ждём env keys

| Что | Статус |
|---|---|
| Dockerfile (multi-stage: deps → builder → web / worker) | ✅ |
| docker-compose.yml (web + worker, external network `aisales_aisales-net`) | ✅ |
| Next.js standalone output | ✅ (`output: "standalone"` в next.config) |
| **`npm install` локально** | ✅ 495 пакетов |
| **`npm run typecheck`** | ✅ 0 ошибок |
| **`npm run build`** | ✅ 33 routes скомпилированы |
| Lazy DB connection (build-time без DATABASE_URL) | ✅ stub fallback в `src/lib/db/index.ts` |
| webhook_events таблица + dedup helper | ✅ Применено на проде 2026-05-19 |
| Stripe webhook · идемпотентность по event_id | ✅ Дополнительно к `payments.status` check |
| Provider webhook · идемпотентность по event_id | ✅ Дополнительно к `ai_jobs.status` check |
| БД `ai_hub` + 14 таблиц + 14 tools + 4 packages | ✅ На проде |
| MinIO bucket `ai-hub-media` | ✅ |
| `pg_backup.sh` патч под PG_DBS env | 🟡 PATCH написан, нужно применить вручную → [DEPLOY.md шаг 1](DEPLOY.md) |
| Caddy блок `aihub-app.46-62-215-11.nip.io` | 🟡 готовый блок → [DEPLOY.md шаг 6](DEPLOY.md) |
| Env keys для прода (FAL_KEY, REPLICATE, STRIPE, SMTP) | ❌ Нужны от пользователя |
| Build + deploy на проде | ❌ Блокируется env keys |

---

## Матрица интеграций

| Провайдер | Auth | Webhooks | Реализовано | Используется в tools |
|---|---|---|---|---|
| **fal.ai** | Bearer key | HMAC SHA-256 | ✅ | text-to-image, image-edit, bg-remove, image-to-video*, text-to-video* |
| **Replicate** | Bearer token | Standard Webhooks (svix) | ✅ | image-upscale, face-swap |
| **Kling direct** | JWT (HS256, 30 min) | нет (polling) | ❌ stub | — (роутится через fal) |
| **Runware** | API key | ? | ❌ stub | — |
| **ModelsLab** | API key | ? | ❌ stub | — |
| **internal (Claude)** | Anthropic API key | n/a (sync) | ❌ stub | reels-script |
| **Stripe** | Secret key | Standard webhook signing | 🟡 в работе | покупка токенов |

*Stage 6, в работе.

## Открытые вопросы / решения

1. **RU-платежи** — Stripe не для российских физлиц. Варианты: ЮKassa (нужно ИП/ООО), CloudPayments (то же), Telegram Stars (уже есть инфра в `tma.46-62-215-11.nip.io`, см. memory `project_stars_billing.md`).
   - 🟢 Решение: использовать **обе** — Stripe для иностранцев, Stars для RU. Single source of truth — `payments.provider`.

2. **MinIO bucket backup** — `aux_backup.sh` не покрывает MinIO (см. CLAUDE.md TL;DR). Когда `ai-hub-media` начнёт расти:
   - А) `mc mirror local/ai-hub-media /backups/ai-hub-media` в aux_backup
   - Б) MinIO bucket replication на отдельный node
   - C) забить (single-node MinIO достаточно для MVP)

3. **pg_backup и новая БД** — нужно проверить, дампит ли `pg_backup.sh` кластер целиком или поименно. Если поименно — добавить `ai_hub`.

4. **Direct Kling vs через fal** — fal берёт margin сверх Kling. На объёме (~1000 видео/день) разница может стать существенной. Прикинуть точку безубыточности direct-Kling.

5. **Provider quality tracking** — нужны метрики «успешных задач / refund rate» по каждому провайдеру. Сейчас нет инфры для измерения. Если разные модели для одной задачи (Этап 4 backlog A/B) — критично.

---

## Гайд по deploy

См. README → секция «Деплой на Hetzner» для пошаговой инструкции. TL;DR:

```bash
# 1. БД
ssh prod
docker exec aisales-postgres psql -U aisales \
  -c "CREATE DATABASE ai_hub; \
      \\c ai_hub \
      CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 2. MinIO bucket
docker exec aisales-minio mc mb local/ai-hub-media

# 3. Compose-проект
# /root/ai-command-center/apps/ai-hub/docker-compose.yml
#   ai-hub-web (Next.js на 3010)
#   ai-hub-worker (тот же образ, entrypoint: node dist/worker.js)

# 4. Caddy блок (уже частично есть для лендинга)
# aihub.46-62-215-11.nip.io { reverse_proxy ai-hub-web:3010 }

# 5. .env.production — заполнить FAL_KEY, REPLICATE_API_TOKEN, STRIPE_*, SMTP_URL
```
