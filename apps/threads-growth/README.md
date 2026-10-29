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
| см. ниже | `app.workers.funnel_worker <job>` | воронка Threads → Telegram (или `POST /cron/funnel/<job>`) |

## Воронка Threads → Telegram (`app/funnel`)

Система «ветка-инструмент» по скиллу `threads-telegram-funnel` (текст скилла —
системный промпт агентов, `app/prompts/funnel_skill.md`). Каждое утро агент
готовит 3 ветки и присылает карточками в тему «Threads» командной форум-группы.
Вы одобряете, правите или просите другое; одобренные выходят в 10:00, 13:00 и
18:00 МСК, бот приносит ссылку, черновики ответов на комментарии и через 48 часов
— цифры и решение о перевыпуске. **Без ✅ ничего не публикуется.**

```
05:00 research ─ Apify: что залетело у доноров и по темам за 30 дней (xn), хиты разворачиваются в ветку
06:00 metrics ─ метрики веток + оценка 48 ч ─┐
06:30 plan ──── темы на слоты (кластеры по весам, ~35% перевыпусков после 2 недель)
07:00 generate ─ Writer → Editor → проверка §13 → карточка + черновик приёмника
      ✅ ✏️ 🔄 ♻️ 📎 ⏰ 🗑 в Telegram
*/5   publish ── материалы за час до слота → выход цепочкой через reply_to_id
*/15  comments ─ черновики ответов первые 2 часа → ✅ Отправить
пн    report ─── лучшие/худшие хуки, кластеры, клики, подписки → новые веса
вс    token ──── продление токена Threads (60 дней)
```

| Модуль | Что |
|---|---|
| `schedule.py` | слоты, 6 кластеров и шаблоны A–D, доля перевыпусков (чистые функции) |
| `qa.py` | чек-лист §13: ≤500 символов, ≥2 числа в хуке, мид-ролл на 60–75%, финал со ссылкой, `[уточнить]`, громкость |
| `recycle.py` | победитель (топ-10% по шеры+ответы или ≥3× медианы лайков), перевыпуск 3–10 дней, архив 30–45 дней, веса кластеров |
| `research.py` | исследование через Apify (`futurizerush/meta-threads-scraper`): посты доноров и поиск, xn = вовлечённость / медиана автора |
| `cards.py` | карточки и кнопки Telegram; в карточке — прогноз виральности 0–10 с опорой на хиты |
| `agents.py` | агенты Claude: план, ветка, редактор, правка, новые хуки, приёмник, ответы (structured outputs) |
| `threads_api.py` | цепочки, картинки/карусели, ответы, метрики, клики по ссылкам, лимиты, refresh токена |
| `telegram_api.py` | Bot API: карточки, ссылки-приглашения, посты в канал, закреп |
| `storage.py` / `stt.py` | MinIO для картинок · Whisper для голосовых правок |
| `service.py` / `jobs.py` | оркестрация и задачи крона |
| `bot/funnel_bot.py` | кнопки, правки ответом на карточку, `/plan /stats /story /receiver`, вступления в канал |

Новые таблицы (миграция `0002_funnel`): `funnel_threads` (тело + 6 хуков, ссылка
`{link}` подставляется своя на каждую ветку), `funnel_receivers` (библиотека
постов-приёмников), `funnel_story_bank` (банк фактов — личные цифры агент берёт
только отсюда), `funnel_comments`, `funnel_channel_joins`, `funnel_state`.

### Исследование и прогноз виральности

Темы не берутся «из головы»: в 05:00 агент собирает посты доноров
(`FUNNEL_DONORS`) и топ поиска (`FUNNEL_RESEARCH_QUERIES`) за 30 дней и считает
xn — во сколько раз пост сильнее обычного у автора. План дня обосновывает
каждую тему id этих хитов. Каждая ветка получает прогноз 0–10 от
агента-аналитика (`prompts/funnel_forecast.md`): почему залетит, на какие хиты
опирается (со ссылками), риски, как поднять. Ниже `FUNNEL_MIN_SCORE` (6) агент
один раз дорабатывает ветку по подсказке. Через 48 часов прогноз сравнивается с
фактом, в недельном отчёте — точность прогноза. `/top` — что сейчас залетает.

### Запуск по этапам

1. **Тексты** — `FUNNEL_AUTOPUBLISH=0`: 3 карточки утром, правки и смена хука;
   в слот бот присылает посты по одному — публикуете сами. Нужно: тема в
   форум-группе (`FUNNEL_CHAT_ID`, `FUNNEL_TOPIC_ID`), `ANTHROPIC_API_KEY`.
2. **Автопубликация** — `FUNNEL_AUTOPUBLISH=1`: приложение в Meta for Developers
   (`threads_basic`, `threads_content_publish`, `threads_manage_replies`,
   `threads_manage_insights`), аккаунт с токеном в мини-аппе, MinIO для картинок.
3. **Канал и замер** — бот админом в канале (`CHANNEL_ID`, `CHANNEL_MODE`):
   приёмники от бота, ссылки по веткам, замер 48 ч, отчёт по понедельникам.
4. **Перевыпуски** — включаются сами через 2 недели данных (`FUNNEL_START_DATE`).

```bash
docker compose run --rm api alembic upgrade head
docker compose run --rm api python -m app.workers.funnel_worker seed   # факты, доноры, веса
docker compose up -d api bot
# n8n: импортировать n8n/threads-funnel.workflow.json, задать THREADS_FUNNEL_URL и THREADS_CRON_SECRET
```

Проверка без сети: `python -m app.funnel.{schedule,qa,recycle,cards}`; сквозной
прогон дня на Postgres с фейками внешних сервисов — `python -m tests.funnel_smoke`
(пишет в отдельную схему и удаляет её).

## Безопасность

`access_token` аккаунтов шифруется Fernet (`core/security.py`) — в БД не хранится
открытым. Ключ — `TOKEN_ENCRYPTION_KEY`. Публикация — строго при `approved`.
Реплаи на прогреве — через апрув; авто-режим включается по warmup-лестнице.

## Статус

MVP-фундамент по MASTER-ТЗ: модели, схема (Alembic), скоринг, warmup, learning,
все API-эндпоинты и воркеры, клиенты Apify/Claude/Threads/Voyage (gated), Docker.
Frontend-дашборд (дизайн-система AI Mastery) — фаза v2.
