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
  `deploy` — бэкап кода и `.env` в `/opt/studio-kadrik/backups`, установка bubblewrap (и профиля AppArmor на Ubuntu),
  `SANDBOX=bwrap` в `.env`, ключи из секретов GitHub, замена кода, рестарт, проверка порта, откат при сбое.
  `data/` и окружение Python деплой не трогает.
- Место на диске: `.github/workflows/cleanup-studio-kadrik.yml` раз в 2 дня (03:17 UTC) удаляет папки монтажей в `JOBS_DIR`,
  не менявшиеся больше 2 дней (служебные `_*` и папки, где что-то менялось недавно, остаются), кэши pip/yt-dlp/npm и старые
  релизы — `deploy/cleanup.sh`. Вручную — тот же workflow (свой срок) или режим `cleanup` деплоя (удалить свежие за N дней).

## Инварианты

- `SELL_MONTAGE=1` (переменная GitHub `STUDIO_KADRIK_SELL`, применяется деплоем) открывает монтаж всем (пробный рилс + пакеты за Stars); без флага монтаж — только `OWNER_ID`,
  `ALLOWED_IDS` и выданным по заявке (`access.json`).
- Платёж зачисляется один раз: `PAID_IDS` из `ledger.jsonl` по `telegram_payment_charge_id`. `ledger.jsonl` не обрезать.
- Неудачный монтаж возвращает оплату (`refund`) — пробный снова доступен, монтажи на баланс.
- Одна задача Claude за раз (`RUN_LOCK` + `heavy_slot`); при лимите Claude очередь ставится на паузу до сброса.
- **Песочница.** Монтаж — Claude Code с `Bash`, а тексты клиентов (пожелания, правки, сценарий) идут в промпт. Поэтому задачи
  всех, кроме `OWNER_ID`/`ALLOWED_IDS`/доступа по заявке (и задачи Persona `EXT_UID`), идут только через `jail()` — bubblewrap:
  своя домашняя папка `SANDBOX_HOME`, на запись только папка задачи, на чтение система, Claude, скиллы, профиль, `PACK_DIR`,
  `SANDBOX_RO`; окружение бота не передаётся (только `SANDBOX_ENV` и ключ API). Перед каждым запуском из `SANDBOX_HOME`
  удаляются `settings.json`, `CLAUDE.md`, hooks и т.п. — одна задача не настраивает следующую. При старте `jail_selftest()`
  проверяет песочницу; если она не работает, монтаж клиентов закрыт (`jail_blocked`, ничего не списывается), владельцу — сообщение.
  `UNSAFE_NO_SANDBOX=1` — осознанно пустить без неё. Параметр `folder` (папка на машине) — только своим.
- Вход Claude: `KADRIK_ANTHROPIC_API_KEY` (ключ API) → иначе `CLAUDE_CODE_OAUTH_TOKEN` из `.env` (`claude setup-token`,
  живёт год) → иначе файл `~/.claude/.credentials.json` владельца, смонтированный в песочницу. Слетел вход (`AUTH_RE`
  в ответе Claude) — `auth_alarm()` пишет владельцу, как починить (не чаще раза в 30 минут), клиенту — `AUTH_LINE`.
- Оплата картой: `PAY_PROVIDER_TOKEN` (провайдер из @BotFather → Payments, например ЮKassa) + `PACKS_RUB`
  (`p1:490,p5:1790,…`); счёт `pr:<пакет>`, чек 54-ФЗ через `provider_data` (`PAY_RECEIPT`, `PAY_VAT_CODE`).
  Звёзды — счёт `pk:<пакет>`. `pay_ok()` сверяет пакет, валюту и сумму. Возврат картой — `/refund` снимает монтажи,
  деньги возвращаются в кабинете провайдера.
- Бэкап: каждый день в `BACKUP_HOUR`:30 (BOT_TZ) zip `data/` + очереди в `backups/` (14 последних) и копия владельцу в Telegram;
  вручную — `/backup`.
- Мониторинг: `GET /health` (ok, очередь, пауза, песочница, продажи); `.github/workflows/monitor-studio-kadrik.yml`
  проверяет его каждые 30 минут, упавший запуск — письмо от GitHub.

## Проверка локально

```bash
cd apps/studio-kadrik && python3 -m venv venv && venv/bin/pip install -r requirements.txt
BOT_TOKEN=123456:TEST JOBS_DIR=/tmp/kadrik-jobs venv/bin/python -c 'import bot'
```
