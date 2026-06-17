# AI Threads Growth Agent

AI-агент роста Threads до +10 000 подписчиков/мес: **дискавери виралки → анализ
паттернов → адаптация под стиль Ильи Палия → публикация + реплаи → аналитика →
самообучение**. Реализация MASTER-ТЗ (см. `CLAUDE.md` в этой папке).

Стек: **Python 3.11 · FastAPI · PostgreSQL + pgvector · SQLAlchemy + Alembic ·
Claude API · Apify · n8n (кроны) · Telegram-апрув · Docker**.

## Конвейер (8 модулей)

```
[1 Scraper(Apify)] → [2 Scoring(Xn+velocity)] → [3 Pattern Analyzer(Claude)]
        │                                                  │
        │                                                  ▼
        │                                   [4 Rewrite(Claude+style+similarity)]
        ▼                                                  │
[5 Reply Engine(Claude)] ───────────► Telegram approve ◄──┘
                                              │
                                              ▼
                              [6 Publishing(Threads API)]
                                              │
                                              ▼
              [8 Analytics(Insights)] ──► [Learning loop → веса паттернов]
                                              ▲
                              [7 Warmup ramp + accounts]
```

| Модуль | Файл | Суть |
|---|---|---|
| 1 Scraper | `services/scraper_service.py` | Apify (Threads/X/Reddit), фильтр <72ч, дедуп по embedding>0.92 |
| 2 Scoring | `services/scoring_service.py` | `xn = views/медиана автора` (главный ранжир) + velocity + категории A/B/C/D |
| 3 Pattern | `services/ai_analysis_service.py` | Claude извлекает паттерн (структуру, не текст) → `content_patterns` |
| 4 Rewrite | `services/rewrite_service.py` | адаптации под стиль Ильи; гейт `text_sim<0.25`, `sem_sim<0.80` |
| 5 Reply | `services/reply_service.py` | ценные реплаи (анти-«согласен!»), главный драйвер роста |
| 6 Publishing | `services/publishing_service.py` | двухшаговая публикация, **только approved** |
| 7 Warmup | `services/warmup_service.py` | ramp-капы по дню прогрева, готово к сетке персон |
| 8 Analytics+Learning | `services/analytics_service.py`, `services/learning_service.py` | инсайты, KPI-дельта, веса паттернов (reach-only vs follower-gaining) |

## Быстрый старт (Docker)

```bash
cp .env.example .env                # заполни ключи (см. ниже)
docker compose up -d db api
docker compose run --rm api alembic upgrade head     # схема + pgvector
open http://localhost:8088/docs                      # Swagger
```

Без Docker (dev):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8080
```

## Проверка чистой логики (без сети и БД)

Скоринг, warmup-ramp и петля обучения — чистые функции с самопроверкой:

```bash
cd backend
python -m app.services.scoring_service    # Xn / velocity / категории / rank
python -m app.services.warmup_service     # лестница капов по дням
python -m app.services.learning_service   # follower-gaining / reach-only / fail
```

## Минимально нужные ключи в `.env`

| Что заработает | Ключи |
|---|---|
| API + схема + скоринг/warmup/learning | `DATABASE_URL` (+ опц. ничего) |
| Создание аккаунтов с токеном | `TOKEN_ENCRYPTION_KEY` |
| Дискавери | `APIFY_TOKEN`, `APIFY_THREADS_ACTOR` (и X/Reddit акторы) |
| Анализ/генерация/реплаи | `ANTHROPIC_API_KEY` |
| Семантический дедуп и similarity-гейт | `VOYAGE_API_KEY` (иначе лексический фолбэк) |

Без ключа соответствующий внешний вызов падает с понятным сообщением, а не молча.

## API (§14)

`viral-posts` (лента/скрейп) · `content` (генерация/апрув) · `replies`
(цели/генерация/апрув) · `publishing` (schedule/publish-now/calendar) ·
`analytics` (overview/posts/patterns) · `competitors` · `accounts` (+warmup-tick).
Полный список — `/docs`.

## Кроны n8n (§14)

n8n дёргает воркеры (`docker compose run --rm api python -m app.workers.<...>`):

| Расписание | Команда | Что |
|---|---|---|
| каждый 1ч | `app.workers.scrape_worker scrape` | дискавери (Apify) |
| каждые 3ч | `app.workers.scrape_worker rescore` | пересчёт xn/velocity/rank + наполнение `reply_targets` |
| ежедн. 09:00 | `app.workers.generate_worker` | анализ паттернов + 20 драфтов адаптаций |
| каждые 30мин | `app.workers.reply_worker` | реплаи в пределах cap |
| каждые 30мин | `app.workers.publish_worker` | публикация scheduled, чьё время настало |
| каждый 1ч | `app.workers.analytics_worker collect` | сбор инсайтов + снимки подписчиков |
| ежедн. 00:05 | `app.workers.analytics_worker daily` | warmup-tick + дневная петля |

## Telegram-апрув (MVP)

Апрув контента и реплаев — через бота (`app/bot/approval_bot.py`), пока нет
веб-дашборда (v2). Запуск: `docker compose up -d bot` или
`python -m app.bot.approval_bot`.

```
/start    — проверка доступа (отвечает только OWNER_TELEGRAM_ID)
/drafts   — адаптации (generated_content) на ревью карточками
/replies  — реплаи на ревью
```

Кнопки под карточкой: **✅ Одобрить** (→ `approved`), **🚀 Опубликовать/Ответить**
(approve + немедленная публикация), **❌ Отклонить / ⏭ Пропустить**. Повторные
клики и гонки безопасны — переход применяется только из ожидаемого статуса.
Опц. `REVIEW_DAILY_TIME=HH:MM` (UTC) — ежедневный авто-пуш на ревью.

Проверка чистых функций бота: `python -m app.bot.approval_bot selftest`.

## Безопасность

`access_token` аккаунтов шифруется Fernet (`core/security.py`) — в БД не хранится
открытым. Ключ — `TOKEN_ENCRYPTION_KEY`. Публикация — строго при `approved`.
Реплаи на прогреве — через апрув; авто-режим включается по warmup-лестнице.

## Статус

MVP-фундамент по MASTER-ТЗ: модели, схема (Alembic), скоринг, warmup, learning,
все API-эндпоинты и воркеры, клиенты Apify/Claude/Threads/Voyage (gated), Docker.
Frontend-дашборд (дизайн-система AI Mastery) — фаза v2.
