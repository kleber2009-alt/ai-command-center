# Перенос на наш сервер — статус и роадмап

**Дата:** 16 мая 2026
**Ветка:** `claude/start-project-window-JTYfU`
**Цель:** уйти с Vercel + Supabase, всё хостить на Hetzner `46.62.215.11`.

---

## TL;DR

✅ **Код переехал полностью.** Локально стек поднимается одной командой и проходит smoke-тесты. На сервере осталась одна команда:

```bash
ssh aisales@46.62.215.11
cd ~/ai-command-center && git pull && bash scripts/deploy.sh
```

⚠ **Финальный шаг (запуск на Hetzner) делает оператор.** Из эпhemerного sandbox без SSH-ключа сервер недостижим — это правильное ограничение.

---

## Что сделано (5 коммитов)

| # | Коммит | Что |
|---|---|---|
| 1 | `5378d65` | `.gitignore` + `package-lock.json` (cleanup до миграции) |
| 2 | `0ac77ec` | Импорт `ai-sales-system` в подпапку `ai-sales/` |
| 3 | `23ee0d5` | **Фаза 1**: SQL-миграции `004_platform_metrics.sql` + `005_platform_seed.sql`. 3 таблицы для дашборда: `platform_users`, `lesson_progress`, `platform_subscriptions`. Seed: 50 пользователей, 30 с прогрессом по урокам, 18 активных подписок (`pro`/`builder`/`architect`). |
| 4 | `807511d` | **Фаза 2**: дашборд переехал с Supabase на `pg`. Новый `src/lib/db.ts` (общий Pool), переписан `/api/metrics` на агрегированные SQL-запросы, удалён неиспользуемый `src/lib/supabase.ts`, обновлён `package.json`. |
| 5 | `e3f8ee3` | **Фаза 3**: `Dockerfile` (multi-stage, standalone Next.js), сервисы `dashboard` + `caddy` в `docker-compose.yml`, `Caddyfile` (роутинг + auto-HTTPS через Let's Encrypt), обновлён `CLAUDE.md`. |

Дополнительно: поправлены 2 пре-существующих бага в `ai-sales/04-database/003_analytics_schema.sql` (несуществующая функция `trigger_set_updated_at` и колонки `c.stage` / `cl.name`) — без них init Postgres ломался ещё до моих миграций.

---

## Локальная верификация (то, что я успел прогнать здесь)

```
✓ docker compose up -d postgres
✓ Все 4 миграции применились (18 таблиц в БД)
✓ SELECT * FROM platform_users  →  50 строк
✓ SELECT * FROM lesson_progress →  417 строк
✓ SELECT * FROM platform_subscriptions WHERE status='active' →  18

✓ npm run build → .next/standalone/server.js
✓ npm start, подключение к контейнеру postgres
✓ GET /api/metrics → 200 OK, payload:
   {
     "totalUsers": 50,
     "activeUsers7d": 35,
     "paidUsers": 18,
     "mrr": 1382,                    // 8×$29 + 7×$79 + 3×$199 ✓
     "conversionRate": "36.0",        // 18/50 ✓
     "completionRate": "32.1",        // 417 / (50*26) ✓
     "daysLeft": 15
   }
✓ GET /dashboard → 200, HTML рендерится
✓ GET / → 307 redirect to /dashboard
```

Что **не** удалось проверить локально:
- Сборка FastAPI-контейнера и Caddy — упёрся в Docker Hub anonymous pull rate-limit (429 Too Many Requests). На сервере, где есть docker login или просто другой IP, проблемы не будет.
- TLS через Let's Encrypt — для этого нужен публичный IP + nip.io домен.

---

## Что должен сделать оператор на сервере

### Шаг 1 — клонировать (или git pull) репо

```bash
ssh aisales@46.62.215.11

# первый раз:
git clone https://github.com/kleber2009-alt/ai-command-center.git ~/ai-command-center

# или, если уже клонирован:
cd ~/ai-command-center && git fetch && git checkout claude/start-project-window-JTYfU && git pull
```

### Шаг 2 — заполнить `.env`

```bash
cd ~/ai-command-center/ai-sales/code
cp .env.example .env
nano .env
```

Перенести значения из старого `~/aisales-app-v2/code/.env` (см. `SECRETS.txt`-чек-лист):

| Переменная | Откуда взять |
|---|---|
| `ANTHROPIC_API_KEY` | `console.anthropic.com` → API Keys |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD` | старый `.env` или сгенерировать новый (32 байта `openssl rand -hex 32`) |
| `DOMAIN` | `46-62-215-11.nip.io` (или твой реальный домен) |
| `TG_BOT_TOKEN`, `TG_WEBHOOK_SECRET`, `ILYA_TG_CHAT_ID` | старый `.env` / BotFather |
| `IG_APP_SECRET`, `IG_PAGE_TOKEN`, `IG_VERIFY_TOKEN` | Meta Developer Dashboard |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | elevenlabs.io (опц., только когда подключаем голос) |
| `VOYAGE_API_KEY`, `OPENAI_API_KEY` | опц. |

### Шаг 3 — деплой

```bash
cd ~/ai-command-center
bash scripts/deploy.sh
```

Скрипт проверит `.env`, соберёт `dashboard` + `api` контейнеры, поднимет весь стек, прогонит smoke-тесты и выведет URL.

### Шаг 4 — Telegram webhook (после первого успешного деплоя)

```bash
bash ai-sales/scripts/setup_tg_webhook.sh
```

---

## Архитектура после переноса

```
                        ┌───────────────────────┐
   https://46-62-215-   │   Caddy 2 (Let's      │
   11.nip.io  ─────────▶│   Encrypt + reverse   │
                        │   proxy)              │
                        └────────┬──────────────┘
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
        ┌────────────────────┐    ┌───────────────────────┐
        │ Next.js dashboard  │    │ FastAPI aisales-api   │
        │ (port 3000)        │    │ (port 8000)           │
        │ standalone build   │    │ /webhooks/*           │
        │ /api/metrics       │    │ /api/sales/*          │
        │ /api/command       │    │ /docs                 │
        └─────────┬──────────┘    └─────────┬─────────────┘
                  │                         │
                  └──────────┬──────────────┘
                             ▼
              ┌──────────────────────────────┐
              │ Postgres 16 (aisales DB)     │
              │   ai-sales-схема:            │
              │   users, clients,            │
              │   conversations, messages,   │
              │   agent_actions, ...         │
              │                              │
              │   dashboard-схема:           │
              │   platform_users,            │
              │   lesson_progress,           │
              │   platform_subscriptions     │
              └──────────────────────────────┘

              + Redis 7 (rate limiting, cache)
              + Qdrant (vector DB для RAG)
              + MinIO (медиа: голос, видео-кружки)
```

Никакого Vercel, никакого Supabase. Один docker compose, всё на одном сервере.

---

## Роадмап (что после переноса)

### P0 — закрыть переезд (1–2 часа на сервере)

- [ ] Залить `claude/start-project-window-JTYfU` на сервер, прогнать `deploy.sh`
- [ ] Проверить `https://46-62-215-11.nip.io/dashboard` рендерит метрики
- [ ] Проверить `https://46-62-215-11.nip.io/docs` (FastAPI Swagger)
- [ ] Замержить ветку в `main` после успешного деплоя
- [ ] Снести проект на Vercel (после успешной проверки)
- [ ] Отозвать `SUPABASE_SERVICE_KEY` в Supabase-консоли

### P1 — доделать дашборд (он ещё на 80% заглушки)

- [ ] Допилить `/team` — список AI-агентов с их статусами (сейчас stub `"В разработке"`)
- [ ] Допилить `/tasks` — задачи от агентов, история выполнения
- [ ] Допилить `/metrics` — графики MRR / conversions / activity (Chart.js или Recharts)
- [ ] Допилить `/briefing` — заменить хардкод `BRIEFING` в `dashboard/page.tsx` на чтение из БД
- [ ] Допилить `/settings` — управление промптами агентов

### P1 — закрыть хардкод в `/api/metrics`

В `src/app/api/metrics/route.ts` всё ещё захардкодены `achieved: 7200000`, `monthGoal: 10000000`, `dailyNeeded: 140000`, `goalPercent: 72`. Это поля цели в рублях. Нужно:
- [ ] Добавить таблицу `revenue_goals(month, target_rub, currency_rate)`
- [ ] Считать `achieved` суммированием по `platform_subscriptions` × `currency_rate`
- [ ] Считать `dailyNeeded` динамически

### P2 — подключить ai-sales к дашборду

Сейчас два бэкенда живут параллельно, но не разговаривают. После переноса:
- [ ] Дашборд показывает воронку из `clients` / `conversations` (есть view `v_funnel_snapshot`)
- [ ] Страница `/conversations` — окно живых диалогов из ai-sales (HTML-прототип уже есть в `ai-sales/06-dashboard-prototype/conversation.html`)
- [ ] Кнопка "Запустить команду" в дашборде дёргает реальные эндпоинты FastAPI вместо текущей анимации

### P2 — production hygiene

- [ ] Бэкапы Postgres (cron + `pg_dump` → MinIO bucket)
- [ ] Логи в Loki/Grafana или хотя бы `docker compose logs --since=24h` в файл
- [ ] Healthcheck-мониторинг (UptimeRobot или просто cron + Telegram-alert)
- [ ] CI: GitHub Actions запускает `npm run build` + `npm run lint` на PR
- [ ] Rate limit на `/api/command` (сейчас можно дёргать Anthropic без ограничений)

### P3 — фичи второй очереди

- [ ] ElevenLabs голос (генерация голосовых ответов в ai-sales)
- [ ] Sieve/Wav2Lip видео-кружки
- [ ] Whisper транскрипция входящих голосовых
- [ ] Voyage эмбеддинги + Qdrant для RAG по knowledge base
- [ ] Подписки + Stripe/ЮKassa интеграция (сейчас `platform_subscriptions` только seed)

---

## Известные риски

1. **Docker Hub rate-limit** — на свежем сервере без `docker login` первый билд может упасть на anonymous pull limit. Решение: `docker login` обычным аккаунтом ИЛИ повторить через час.
2. **`AISALES_MOCK=1` по умолчанию** — FastAPI после деплоя стартует в mock-режиме. Переключить на `=0` только после проверки что все API-ключи в `.env` корректные.
3. **Старая прод-схема в Postgres** — если на сервере уже крутится старый `aisales-postgres` с данными, новый init из `docker-entrypoint-initdb.d` НЕ выполнится (Postgres не трогает не-пустой data dir). Миграции 004 и 005 в этом случае надо накатить руками:
   ```bash
   docker exec -i aisales-postgres psql -U aisales -d aisales \
     < ai-sales/04-database/004_platform_metrics.sql
   docker exec -i aisales-postgres psql -U aisales -d aisales \
     < ai-sales/04-database/005_platform_seed.sql
   ```
4. **`SUPABASE_SERVICE_KEY`** — после успешного переезда отозвать в Supabase-консоли, ключ всё ещё валиден.
