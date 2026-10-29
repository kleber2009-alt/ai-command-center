# studio-kadrik — «Студия Кадрика» (@studio_kadrik_bot)

Игровой мини-апп Prod Skills + монтаж скиллами Creator Pack в том же Telegram-боте. Python 3 (aiogram 3 + aiohttp),
один процесс: бот (long polling) + API и статика мини-аппа на `127.0.0.1:MINIAPP_PORT` (8095), наружу —
cloudflared-туннель `kadrik.aicex.club`. Перенесён из `aicex-library/results/studio-kadrik-bot`; источник правды — здесь.

## Файлы

- `bot.py` — всё: игра (опыт, монеты, серия, квесты, карта стилей, лига недели), монтаж (очередь задач → Claude Code
  со скиллами из `~/.claude/skills` → превью → «ок»/правка → финал), оплата Telegram Stars (пакеты `PACKS`),
  рефералы, разбор рилса (`/razbor`), рассылки, серверное API для Persona Studio (`/api/ext/*`, Bearer `PERSONA_API_KEY`).
- `public/index.html` — мини-апп (vanilla JS). Каждый запрос к `/api/*` подписан `initData` Telegram (HMAC, `check_init`).
- `review_tools.py` — разбор рилса в отдельном окружении `.review-venv` (faster-whisper, Pillow): стоп-кадры, транскрипт, карточка.
- `heavy_slot.py` — общая очередь тяжёлых задач всех ботов на сервере (flock `~/.heavy-slot.lock`). Копия лежит в папке
  каждого бота — держать одинаковой.
- `deploy/server.sh` — выкладка на сервер; `deploy/mac/` — старый запуск на Mac (launchd) и скрипт переезда на сервер.

## Прод

- Сервер `*.aicex.club` (тот же, что hq-office), пользователь `iliapaliy`, папка `/home/iliapaliy/studio-kadrik-bot`,
  systemd-юнит `studio-kadrik-bot`. Рядом `@Productionskill_bot` и другие боты — делят `heavy_slot` и Claude-логин.
- На сервере и только там: `.env` (BOT_TOKEN, OWNER_ID, ALLOWED_IDS, MINIAPP_PUBLIC_URL, TUNNEL_CONFIG, SELL_MONTAGE,
  PERSONA_API_KEY, …), `data/` (`users.json` игроки, `ledger.jsonl` платежи/списания, `access.json`, `stats.json`),
  `.review-venv`, `bot.log`. Задачи монтажа — `JOBS_DIR`. Каталог скиллов — `PACK_DIR` (`~/creator-pack-miniapp`).
- Деплой: `.github/workflows/deploy-studio-kadrik.yml`, только вручную. Режим `check` показывает diff с живым кодом,
  `deploy` — бэкап в `/opt/studio-kadrik/backups`, замена кода, рестарт, проверка порта, откат при сбое.
  `.env`, `data/` и окружение Python деплой не трогает.

## Инварианты

- `SELL_MONTAGE=1` открывает монтаж всем (пробный рилс + пакеты за Stars); без флага монтаж — только `OWNER_ID`,
  `ALLOWED_IDS` и выданным по заявке (`access.json`).
- Платёж зачисляется один раз: `PAID_IDS` из `ledger.jsonl` по `telegram_payment_charge_id`. `ledger.jsonl` не обрезать.
- Неудачный монтаж возвращает оплату (`refund`) — пробный снова доступен, монтажи на баланс.
- Одна задача Claude за раз (`RUN_LOCK` + `heavy_slot`); при лимите Claude очередь ставится на паузу до сброса.
- Монтаж запускает Claude Code с `Bash` в папке задачи. Тексты пользователя (пожелания, правки, сценарий) идут в промпт —
  до открытия продаж всем (`SELL_MONTAGE=1`) монтаж должен работать в песочнице.

## Проверка локально

```bash
cd apps/studio-kadrik && python3 -m venv venv && venv/bin/pip install -r requirements.txt
BOT_TOKEN=123456:TEST JOBS_DIR=/tmp/kadrik-jobs venv/bin/python -c 'import bot'
```
