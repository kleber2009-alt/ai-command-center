# tg-viral-parser — CLAUDE.md

Пайплайн виральных постов из **Telegram-каналов** конкурентов:
парсинг → **скоринг** → **ревью в боте** → **публикация**.

- **Модуль 1** — `tg_viral_parser.py`: парсит свежие посты конкурентов, скорит их
  по относительной виральности и кладёт в Postgres (`parsed_posts`) с оценкой.
- **Модуль 2** — `review_bot.py`: шлёт топ скоренных постов владельцу на ревью
  (inline-кнопки) и публикует одобренное в канал.

> Не путать с `viral_discover` (`apps/infra-worker`) — тот про **Instagram** через
> Apify. Здесь — **Telegram** через user-session (MTProto / Telethon).

## Почему MTProto, а не Bot API

Bot API не умеет читать чужие каналы. Поэтому здесь **user-session** (Telethon /
StringSession). Парсинг-аккаунт обязан быть **ОТДЕЛЬНЫМ** (не основной номер) —
риск флуд-лимитов и блокировок.

## Скоринг — относительные выбросы

Не абсолютные просмотры (тогда крупный канал всегда побеждает), а выброс внутри
своего канала: каждая метрика делится на медиану канала.

```
Xn = просмотры / медиана      Rn = реакции / медиана      Fn = репосты / медиана
score = (w_v·Xn + w_r·Rn + w_f·Fn) · recency
recency = 0.5 ^ (age_hours / half_life_hours)     # half_life = 48ч по умолчанию
```

Веса по умолчанию: репост (1.5) > реакция (1.2) > просмотр (1.0). Метрики
нормированы на свой канал ⇒ сравнимы между каналами ⇒ глобальный топ — простое
слияние (`top_across_channels`).

Функции скоринга чистые (`score_channel`, `top_across_channels`) — тестируются
без сети и БД через `selftest`.

## Команды

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python tg_viral_parser.py login      # 1 раз: получить TG_SESSION_STRING для .env
python tg_viral_parser.py init-db    # 1 раз: создать таблицу parsed_posts (нужен DATABASE_URL)
python tg_viral_parser.py run        # парсинг + скоринг + сохранение + топ в консоль
python tg_viral_parser.py            # то же, что run
python tg_viral_parser.py selftest   # проверка математики скоринга на моках (без сети/БД)
```

## Конфиг

Всё через `.env` (см. `.env.example`). `Config.validate()` падает с понятным
сообщением, если не заданы `TG_API_ID` / `TG_API_HASH` / `TG_SESSION_STRING` /
`COMPETITOR_CHANNELS`. `DATABASE_URL` необязателен — без него вывод только в консоль.

## Storage

Таблица `parsed_posts` (Supabase/Postgres). Upsert по `(channel, message_id)` —
повторный прогон обновляет метрики и score, не плодит дубли. Поле `review_status`
(`new|sent|approved|rejected|published`) — задел под следующий модуль (ревью в боте).

`.env` и `*.session` в `.gitignore` — НЕ коммитим.

## Модуль 2 — review_bot.py (ревью + публикация)

Telegram-бот (`python-telegram-bot`, Bot API): берёт топ постов из `parsed_posts`
(`review_status='new'`), шлёт владельцу карточками с inline-кнопками и публикует
одобренное в канал.

```
/start   — проверка доступа (отвечает только OWNER_TELEGRAM_ID)
/review  — прислать топ необработанных постов на ревью (REVIEW_BATCH штук)
✅ Одобрить → build_publish_text(row) → PUBLISH_CHANNEL,  review_status='published'
❌ Отклонить →                                            review_status='rejected'
```

Гонки/повторные клики защищены SQL: `sent` ставится только из `new`, финальный
статус — только из `('new','sent')`, поэтому старая кнопка не перезапишет уже
опубликованное.

**Авто-пуш** (`REVIEW_DAILY_TIME=HH:MM` UTC): JobQueue раз в день сам шлёт топ на
ревью (та же `push_review_batch`, что у `/review`). Пусто = только ручной `/review`.

**Рерайт через Claude** (`ANTHROPIC_API_KEY`): при одобрении текст переписывается
(`build_publish_text` → `rewrite_text`) в самостоятельный пост, а не дословную копию
конкурента; модель — `ANTHROPIC_MODEL` (по умолч. `claude-sonnet-4-6`). Ключ не задан →
публикуется verbatim. Рерайт упал → пост НЕ публикуется, кнопки остаются (не льём
чужой текст молча). Чистое медиа (без текста) рерайт пропускает → ссылка на оригинал.

Функции представления (`card_text`, `publish_text`, `post_url`, `_parse_hhmm`) и
`build_publish_text` (с выключенным рерайтом) чистые — проверяются
`python review_bot.py selftest` без сети/БД/telegram/Claude.

Доп. env (см. `.env.example`): `TELEGRAM_BOT_TOKEN`, `OWNER_TELEGRAM_ID`,
`PUBLISH_CHANNEL` (бот должен быть **админом** канала), `REVIEW_BATCH`,
`REVIEW_DAILY_TIME` (опц.), `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` (опц.).
`DATABASE_URL` для бота **обязателен**.

## Docker

Два сервиса в `docker-compose.yml`:

- **tg-viral-parser** — CLI, отрабатывает и завершается (cron-style), без restart-петли:

  ```bash
  docker compose run --rm tg-viral-parser                          # парсинг+скоринг (по умолч.)
  docker compose run --rm tg-viral-parser tg_viral_parser.py selftest   # проверка скоринга
  docker compose run --rm tg-viral-parser tg_viral_parser.py init-db    # 1 раз: таблица
  docker compose run --rm tg-viral-parser tg_viral_parser.py login      # 1 раз: session string
  ```

- **tg-viral-review-bot** — long-running review-бот (polling), `restart: unless-stopped`:

  ```bash
  docker compose up -d tg-viral-review-bot
  ```

`Dockerfile` → `ENTRYPOINT ["python","-u"]`; скрипт+команда — через CMD/compose `command`.
