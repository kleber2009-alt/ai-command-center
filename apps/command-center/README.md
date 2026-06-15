# AI Command Center

Next.js 14 дашборд для оператора AI Mastery Platform. Сейчас совмещает два слоя:

- текущий проектный хаб и каталог модулей;
- новый skeleton `Web Office` для агентской команды, решений, памяти и office-core.

Читает live-данные из `aisales-postgres` (см. `apps/aisales/`).

## Страницы

| URL | Что |
|---|---|
| `/dashboard` | Цель месяца, 6 stat-карточек, AI-команда, задачи, брифинг |
| `/team` | Карточки 5 AI-агентов (analyst/cfo/cmo/cs/ceo) + статистика запусков |
| `/tasks` | Список задач с фильтрами по агенту/статусу, inline-смена статуса |
| `/conversations` | Split-pane live-диалоги из `clients`/`conversations`/`messages` |
| `/metrics` | 4 sparkline-карточки за 30 дней + воронка |
| `/briefing` | Auto-summary с risks/growth/forecast (из БД) |
| `/settings` | Editable промпты агентов (override в БД, fallback на in-code) |
| `/office` | CEO overview новой агентской операционной системы |
| `/office/agents` | Состав агентской команды и ее источники сигналов |
| `/office/decisions` | Decision Inbox skeleton |
| `/office/memory` | Memory + journal skeleton |
| `/office/model` | office-core data model skeleton |

## API

- `GET /api/metrics` · `GET /api/metrics/timeseries`
- `GET /api/team/stats`
- `GET /api/tasks` · `PATCH /api/tasks`
- `POST /api/command` (rate limit 30/min/IP)
- `GET /api/prompts` · `PUT /api/prompts`
- `GET /api/briefing`
- `GET /api/conversations` · `GET /api/conversations/[id]`

## Что в БД

Использует `aisales-postgres` (общий с FastAPI v1/v2). Таблицы:

| Таблица | Откуда |
|---|---|
| `platform_users`, `lesson_progress`, `platform_subscriptions` | `apps/aisales/db-init/004_platform_metrics.sql` + `005_platform_seed.sql` |
| `agent_tasks` | `006_agent_tasks.sql` |
| `agent_prompt_overrides` | `007_agent_prompts.sql` |
| `revenue_goals` | `008_revenue_goals.sql` |
| `conversations`, `messages`, `clients` | `001_initial_schema.sql` (используем для `/conversations`) |

Если postgres-контейнер уже работает с данными — миграции 004–008 надо накатить руками:

```bash
cd ~/ai-command-center/apps/aisales
for f in db-init/00{4,5,6,7,8}_*.sql; do
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$f"
done
```

## Локальный dev

```bash
cd apps/command-center
npm install
cp .env.example .env.local
# В .env.local: DATABASE_URL=postgresql://aisales:PASSWORD_URLENC@127.0.0.1:5432/aisales
npm run dev   # → http://localhost:3003
```

## Production (Hetzner)

Контейнер `aisales-command-center` собирается из этой папки и определён
в `apps/aisales/docker-compose.yml` (живёт в той же сети что и
`aisales-postgres`).

```bash
cd ~/ai-command-center/apps/aisales
docker compose up -d --build command-center
docker compose logs -f command-center
```

Caddy роут — `infra/snippets/host-command-center.example.caddy`
(поддомен `cmd.46.62.215.11.nip.io`). Скопируй блок в
`/etc/caddy/Caddyfile` и сделай `systemctl reload caddy`.

## Стек

- Next.js 14 App Router + React 18 + TypeScript + Tailwind
- `pg` (node-postgres) — прямые SQL-запросы без ORM
- `lucide-react` иконки
- Standalone build (`output: 'standalone'`) для слим-контейнера ~150 MB

UI на русском, comments/identifiers на английском. Dark-mode forced
в `<html className="dark">`. Path alias `@/* → src/*`.
