# tg-viral-parser — деплой

Прод — Hetzner-бокс (`ssh prod`), Docker + compose. Это standalone-приложение
(свой `docker-compose.yml`), запускается из каталога `apps/tg-viral-parser/`.

Два юнита:
- **tg-viral-parser** (модуль 1) — CLI парсинг+скоринг, отрабатывает и завершается → по cron.
- **tg-viral-review-bot** (модуль 2) — long-running review-бот (polling) → `up -d`.

## 0. Что нужно заранее

| Переменная | Где взять | Для чего |
|---|---|---|
| `TG_API_ID`, `TG_API_HASH` | my.telegram.org → API development tools | парсер (MTProto) |
| `TG_SESSION_STRING` | `... login` (шаг 3) — **отдельный** аккаунт, не основной номер | парсер |
| `COMPETITOR_CHANNELS` | `@ch1,@ch2,...` | какие каналы парсить |
| `DATABASE_URL` | Postgres (Supabase / `aisales-postgres`) | хранилище `parsed_posts` (**обязателен для бота**) |
| `TELEGRAM_BOT_TOKEN` | @BotFather | review-бот |
| `OWNER_TELEGRAM_ID` | твой numeric id (@userinfobot) | только он видит ревью и жмёт кнопки |
| `PUBLISH_CHANNEL` | `@username` или `-100…` | куда публиковать одобренное; **бот должен быть админом канала** |
| `REVIEW_DAILY_TIME` | `HH:MM` UTC, опц. | ежедневный авто-пуш топа на ревью |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) | опц. | рерайт текста через Claude перед публикацией |

## 1. Выложить код на прод

```bash
# вариант A — clone ветки
ssh prod 'git clone -b claude/tg-viral-parser-scoring-0i0d0z \
  https://github.com/kleber2009-alt/ai-command-center /root/ai-command-center 2>/dev/null \
  || (cd /root/ai-command-center && git fetch origin claude/tg-viral-parser-scoring-0i0d0z \
      && git checkout claude/tg-viral-parser-scoring-0i0d0z && git pull)'
```

## 2. Заполнить .env

```bash
ssh prod 'cd /root/ai-command-center/apps/tg-viral-parser && cp -n .env.example .env && nano .env'
```

## 3. Один раз: session string для парсера (интерактивно — нужен код из Telegram)

```bash
cd /root/ai-command-center/apps/tg-viral-parser
docker compose build
docker compose run --rm tg-viral-parser tg_viral_parser.py login   # выведет TG_SESSION_STRING → вставить в .env
```

## 4. Один раз: создать таблицу parsed_posts

```bash
docker compose run --rm tg-viral-parser tg_viral_parser.py init-db
```

## 5. Прогнать парсер (наполнить parsed_posts)

```bash
docker compose run --rm tg-viral-parser            # = tg_viral_parser.py run
```

Повесить по расписанию (пример — 05:00 ежедневно) в crontab прода:

```cron
0 5 * * * cd /root/ai-command-center/apps/tg-viral-parser && docker compose run --rm tg-viral-parser >> /var/log/tg-viral-parser.log 2>&1
```

## 6. Поднять review-бот

```bash
docker compose up -d tg-viral-review-bot
docker compose logs -f tg-viral-review-bot    # должно быть: "review-bot started; owner=… publish_channel=…"
```

В Telegram владельцу: `/start` → `/review` (или дождаться авто-пуша, если задан `REVIEW_DAILY_TIME`).

## Проверки без прода

```bash
docker compose run --rm tg-viral-parser tg_viral_parser.py selftest   # математика скоринга
docker compose run --rm tg-viral-review-bot review_bot.py selftest    # форматирование карточек
```

## Откат

```bash
docker compose down            # остановить бот
# парсер — cron-задача, просто убрать строку из crontab
```
