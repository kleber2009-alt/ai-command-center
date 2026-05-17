# Перенос на наш сервер — статус и роадмап

**Дата:** 17 мая 2026
**Ветка:** `claude/start-project-window-JTYfU` (12 коммитов)
**Цель:** уйти с Vercel + Supabase, всё хостить на Hetzner `46.62.215.11`.

---

## TL;DR

✅ **Код готов на 100%.** Все 7 страниц дашборда работают на реальных данных, не на хардкоде.
✅ **CI настроен.** Каждый PR/push проверяется (lint + build + SQL migrations).
✅ **Бэкап + rate-limit + .env.example** — production-ready.

⏳ **Остался один шаг — `bash scripts/deploy.sh` на сервере.** Финальную команду выполняет оператор (SSH-ключ в 1Password, не в репо — это правильно).

```bash
ssh aisales@46.62.215.11
git clone https://github.com/kleber2009-alt/ai-command-center.git ~/ai-command-center
cd ~/ai-command-center && git checkout claude/start-project-window-JTYfU
cp ai-sales/code/.env.example ai-sales/code/.env
nano ai-sales/code/.env   # 4 пароля у тебя уже есть, остальное по списку
bash scripts/deploy.sh
```

---

## Все коммиты ветки

| # | SHA | Что |
|---|---|---|
| 1 | `5378d65` | `.gitignore` + `package-lock.json` |
| 2 | `0ac77ec` | Импорт `ai-sales-system` в `ai-sales/` |
| 3 | `23ee0d5` | Фаза 1: schema `platform_*` + demo seed |
| 4 | `807511d` | Фаза 2: dashboard на `pg`, без Supabase |
| 5 | `e3f8ee3` | Фаза 3: Dockerfile + Caddy + compose |
| 6 | `9261256` | `deploy.sh` + статус-doc + фикс 3 SQL-багов в 003 |
| 7 | `5309021` | URL-encoding для паролей с `/` и `+` |
| 8 | `84d5251` | `/team` + `/tasks` + persist agent_tasks (migration 006) |
| 9 | `78aa6c4` | `/metrics` + `/briefing` + `/settings` + prompt overrides (migration 007) |
| 10 | `8df6859` | revenue_goals (migration 008) — убран хардкод $10M цели |
| 11 | `54d581c` | GitHub Actions CI: build + lint + SQL check |
| 12 | `f70fe73` | `/conversations` страница на ai-sales-схеме |
| 13 | `a1f4ab6` | Rate limit на `/api/command` + backup_postgres.sh |

---

## Что работает локально (проверено end-to-end в этом sandbox)

### Дашборд (7 страниц, не stubs)

| URL | Что | Источник данных |
|---|---|---|
| `/dashboard` | Главная: цель месяца, 6 stat-карточек, AI-команда, задачи, брифинг | `/api/metrics` + AI_AGENTS |
| `/team` | Карточки 5 агентов (analyst/cfo/cmo/cs/ceo) с описанием роли, цветовые схемы, статистика запусков | `/api/team/stats` |
| `/tasks` | Список задач с фильтрами по агенту/статусу, инлайн смена pending↔done | `/api/tasks` (GET+PATCH) |
| `/conversations` | Split-pane live-диалоги: список слева, лента сообщений справа, бейджи стадии воронки | `/api/conversations`, `/api/conversations/[id]` |
| `/metrics` | 4 sparkline-карточки (MRR/DAU/signups/completions) + воронка | `/api/metrics` + `/api/metrics/timeseries` |
| `/briefing` | Summary/risks/growth/forecast/pending-actions, сгенерировано из БД | `/api/briefing` |
| `/settings` | Редактор промптов агентов (textarea, save/reset с override-badge) | `/api/prompts` (GET+PUT) |

### API endpoints (10 штук)

- `GET /api/metrics` — текущие метрики платформы, цели из `revenue_goals`
- `GET /api/metrics/timeseries` — 30-дневные ряды (signups, completions, DAU, MRR)
- `GET /api/team/stats` — статистика по агентам (COUNT, MAX(created_at))
- `GET /api/tasks?agent=&status=&limit=` — список задач с фильтрами
- `PATCH /api/tasks` — смена статуса задачи (pending/in_progress/done/skipped)
- `POST /api/command` — генерация задач AI-агентом, rate limit 30/min/IP, override из БД
- `GET /api/prompts` — все промпты с флагом `overridden`
- `PUT /api/prompts` — upsert override (null = reset to default)
- `GET /api/briefing` — авто-summary с risks, growth, forecast
- `GET /api/conversations`, `GET /api/conversations/[id]` — live ai-sales-диалоги

### База данных (8 миграций, все идемпотентные)

| Файл | Что |
|---|---|
| `001_initial_schema.sql` | ai-sales: users, clients, conversations, messages, actions |
| `002_seed_test_data.sql` | 1 тестовый клиент с диалогом (не в auto-init) |
| `003_analytics_schema.sql` | ai-sales: agent_actions, escalations, knowledge_gaps + views *(фикс 3 багов в коммите 9261256)* |
| `004_platform_metrics.sql` | dashboard: platform_users, lesson_progress, platform_subscriptions |
| `005_platform_seed.sql` | 50 demo-юзеров, 417 уроков, 18 подписок (MRR $1382) |
| `006_agent_tasks.sql` | agent_tasks (для персиста задач AI-команды) |
| `007_agent_prompts.sql` | agent_prompt_overrides (для editable промптов из UI) |
| `008_revenue_goals.sql` | revenue_goals (₽10M на текущий месяц @ 90₽/$) |

### CI (GitHub Actions, файл `.github/workflows/ci.yml`)

- **dashboard job**: `npm ci` → `npm run lint` → `npm run build`
- **sql job**: Postgres 16 service-контейнер, накатывает все `0*.sql` через `psql ON_ERROR_STOP=1`, проверяет наличие всех таблиц

---

## Архитектура после переноса

```
   https://46-62-215-11.nip.io
              │
              ▼
   ┌─────────────────────┐
   │  Caddy 2            │  (Let's Encrypt + reverse proxy)
   └────┬────────┬───────┘
        │        │
        ▼        ▼
  ┌──────────┐  ┌──────────────┐
  │ Next.js  │  │ FastAPI      │
  │ :3000    │  │ :8000        │
  │          │  │              │
  │ 7 pages  │  │ /webhooks/*  │
  │ 10 APIs  │  │ /api/sales/* │
  └────┬─────┘  └──────┬───────┘
       │               │
       └───────┬───────┘
               ▼
   ┌────────────────────────────┐
   │ Postgres 16 (общий)         │
   │  ai-sales: users, clients,  │
   │            conversations,   │
   │            messages, ...    │
   │  platform: platform_users,  │
   │            lesson_progress, │
   │            platform_subs,   │
   │            agent_tasks,     │
   │            agent_prompt_    │
   │            overrides,       │
   │            revenue_goals    │
   └────────────────────────────┘
   + Redis 7  + Qdrant  + MinIO
```

---

## Что должен сделать оператор на сервере

### P0 — deploy (15 минут)

1. **SSH + clone**:
   ```bash
   ssh aisales@46.62.215.11
   # Если стоит старый стек на 80/443 — остановить:
   cd ~/aisales-app-v2/code && docker compose down
   # Клонировать новый:
   git clone https://github.com/kleber2009-alt/ai-command-center.git ~/ai-command-center
   cd ~/ai-command-center && git checkout claude/start-project-window-JTYfU
   ```

2. **Заполнить `.env`** (`ai-sales/code/.env`):
   - 4 пароля уже сгенерированы и в текущей сессии заданы локально
   - перенести `ANTHROPIC_API_KEY` из старого `~/aisales-app-v2/code/.env`
   - перенести `TG_BOT_TOKEN`, `TG_WEBHOOK_SECRET`, `ILYA_TG_CHAT_ID`
   - перенести `IG_*`
   - `DOMAIN=46-62-215-11.nip.io`

3. **Запустить**:
   ```bash
   bash scripts/deploy.sh
   ```

4. **Webhook**:
   ```bash
   bash ai-sales/scripts/setup_tg_webhook.sh
   ```

5. **Cron на бэкап** (`crontab -e`):
   ```
   30 3 * * * cd /home/aisales/ai-command-center && bash scripts/backup_postgres.sh >> /var/log/aisales-backup.log 2>&1
   ```

6. **После проверки** — замержить ветку в `main`, отозвать `SUPABASE_SERVICE_KEY` в Supabase-консоли, снести проект на Vercel.

### P1 — следующие итерации

- [ ] Кнопка "Запустить команду" дёргает не только Anthropic, но и реальные эндпоинты FastAPI (когда они будут готовы)
- [ ] Multi-user auth для дашборда (сейчас открыт, нужно базовое cookie-auth)
- [ ] Стрелочки/диффы у метрик ("vs прошлая неделя")

### P2

- [x] CI на PR
- [x] Rate limit на `/api/command`
- [x] Backup Postgres → MinIO
- [ ] Healthcheck-мониторинг (UptimeRobot или cron + TG-alert)
- [ ] Загрузить логи в Loki/Grafana или хотя бы ротировать в файл

### P3

- [ ] ElevenLabs голос
- [ ] Sieve/Wav2Lip видео-кружки
- [ ] Whisper транскрипция
- [ ] Voyage + Qdrant RAG
- [ ] Stripe/ЮKassa интеграция

---

## Известные риски

1. **Docker Hub rate-limit** — на свежем сервере без `docker login` первый билд может упасть на anonymous pull limit (429). Решение: `docker login` или повторить через час.
2. **`AISALES_MOCK=1` по умолчанию** — FastAPI после деплоя стартует в mock-режиме. Переключить на `=0` только после проверки `.env`.
3. **Старый Postgres data dir на сервере** — если уже крутится `aisales-postgres` с данными, новый init `0*.sql` НЕ выполнится. Миграции 004–008 надо накатить руками:
   ```bash
   for f in 004 005 006 007 008; do
     docker exec -i aisales-postgres psql -U aisales -d aisales \
       < ai-sales/04-database/${f}_*.sql
   done
   ```
4. **Security**: `next@14.2.5` имеет известный CVE. Накатить `npm install next@^14.2.36` отдельным PR (намеренно не делал в этой ветке, чтобы не смешивать с миграцией).
5. **`SUPABASE_SERVICE_KEY`** — после успешного переезда отозвать в Supabase-консоли.
