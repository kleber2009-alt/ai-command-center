# threads-growth — CLAUDE.md

AI-агент роста Threads (+10k подписчиков/мес): дискавери виралки → паттерны →
адаптация под стиль Ильи Палия → **публикация + реплаи** → аналитика →
самообучение. Реализация MASTER-ТЗ. Источник правды по архитектуре — `README.md`
в этой папке; этот файл — «что читать первым» + критичные инварианты.

## Стек и структура

Python 3.11 · FastAPI · Postgres + **pgvector** · SQLAlchemy + Alembic · Claude ·
Apify · n8n (кроны) · Telegram-апрув · Docker. Standalone-апп (свой
`requirements.txt`/Dockerfile/compose), НЕ в npm-воркспейсах монорепо.

```
backend/app/
  main.py config.py
  api/        # 7 роутеров = эндпоинты §14
  core/       # database.py(pgvector, ленивый engine), security.py(Fernet), llm.py(Claude/Voyage)
  models/     # 10 SQLAlchemy-моделей §13
  services/   # 9 сервисов §5–§12
  workers/    # 5 воркеров (дёргает n8n)
  bot/        # approval_bot.py — Telegram-апрув контента и реплаев (MVP)
  prompts/    # *.md: style_profile / viral_analysis / rewrite_threads / reply_generation / scoring
alembic/      # 0001_initial — extension vector + все таблицы
```

## Критичные инварианты

- **Скоринг относительный.** `xn_score = views / author_median_views` — главный
  ранжир (НЕ абсолютные лайки). Категории A≥5 · B 3–5 · C 1.5–3 · D<1.5.
  velocity = Δengagement/час — со-сигнал восходящего тренда. Всё в
  `services/scoring_service.py`, чистые функции, `python -m ... selftest`.
- **Дискавери только Apify** (не Playwright). Фильтр свежести <72ч, дедуп по
  embedding > 0.92 (`DEDUP_THRESHOLD`).
- **Reply Engine — обязательный модуль**, главный драйвер роста (>50% прироста).
  Анти-«согласен!» гейт в `reply_service.score_reply_quality`.
- **Публикация только при `approved`** — жёстко в `publishing_service` (на MVP
  без исключений). Реплаи на прогреве — через апрув, авто — по warmup-лестнице.
- **Уникализация:** `text_similarity < 0.25` И `semantic_similarity < 0.80`
  (`rewrite_service.check_similarity`). Не прошедшие адаптации отбрасываются.
- **Warmup-ramp — единственный источник правды** по капам: `warmup_service.RAMP`.
  `warmup_tick` инкрементит день и пересчитывает `daily_post_cap`/`daily_reply_cap`.
- **Токены аккаунтов шифруются** (`core/security.py`, Fernet). В БД и в ответах
  API открытого токена нет. Любой воркер расшифровывает перед вызовом Threads API.
- **Петля обучения** различает **follower-gaining** (weight×1.2), **reach-only**
  (вес не трогаем, флаг `reach_only`) и **fail** (×0.85) — `learning_service`.
- **Ленивый engine.** `core/database.get_engine()` — `@lru_cache`; импорт моделей/
  сервисов не требует живого драйвера БД (важно для чистых selftest-ов и воркеров).

## Чистая логика тестируется без сети/БД

```bash
cd backend
python -m app.services.scoring_service     # selftest
python -m app.services.warmup_service      # selftest
python -m app.services.learning_service    # selftest
python -m app.bot.approval_bot selftest    # карточки/коллбэки бота
```

## Telegram-апрув (MVP)

`app/bot/approval_bot.py` (python-telegram-bot): `/drafts` и `/replies` шлют
владельцу (OWNER_TELEGRAM_ID) карточки с кнопками Одобрить / Опубликовать /
Отклонить. Переходы статусов race-safe (UPDATE ... WHERE status IN (...)).
Telegram/SQLAlchemy/config импортируются лениво — модуль и его selftest грузятся
на голом stdlib. Деплой — сервис `bot` в `docker-compose.yml`.

## Внешние вызовы — gated

Apify / Claude / Voyage / Threads API импортируются лениво и падают с понятным
сообщением без ключа. Пустой `VOYAGE_API_KEY` → дедуп и semantic-гейт мягко
деградируют (остаётся лексический), пайплайн не падает.

## Кроны / воркеры

n8n запускает `python -m app.workers.<scrape|generate|reply|publish|analytics>_worker`
по расписанию из §14 (таблица в `README.md`). Очереди = статусные поля в таблицах.

## Деплой

`docker compose up -d db api` + `alembic upgrade head`. На проде Postgres можно
переиспользовать общий `aisales-postgres` (отдельная БД `threads_growth`) —
тогда сервис `db` не нужен, только `DATABASE_URL`. Frontend (дизайн-система
AI Mastery) — фаза v2.
