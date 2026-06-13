# tg-viral-parser — CLAUDE.md

**Модуль 1** нового пайплайна виральных постов из **Telegram-каналов** конкурентов:
парсинг → **скоринг** → (дальше) ревью в боте → публикация.

Один самодостаточный файл `tg_viral_parser.py`: парсит свежие посты конкурентов,
скорит их по относительной виральности и (опционально) кладёт в Postgres с оценкой.

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

## Docker

CLI отрабатывает и завершается (cron-style), поэтому compose без restart-петли —
запуск по требованию / по расписанию:

```bash
docker compose run --rm tg-viral-parser run        # парсинг + скоринг (по умолч.)
docker compose run --rm tg-viral-parser selftest   # проверка скоринга на моках
docker compose run --rm tg-viral-parser init-db    # 1 раз: создать таблицу
docker compose run --rm tg-viral-parser login      # 1 раз: получить session string
```

`Dockerfile` → `ENTRYPOINT python -u tg_viral_parser.py`, команда — аргументом.
