# ai-sales · деплой на новый сервер (чистый, через nip.io)

Пошаговый runbook. Все шаги выполняются с твоего ноутбука — я (Claude) в
этом монорепо не вижу прод-серверы напрямую, поэтому собрал три скрипта,
которые ты запускаешь сам.

## Что в итоге получится

- Чистый `ai-sales` на новой VPS (Postgres / Redis / Qdrant / MinIO / FastAPI
  / Caddy — 6 контейнеров через `docker-compose.yml`).
- Домен — `aisales.<ip-dashed>.nip.io`, HTTPS через Let's Encrypt + Caddy.
- `AISALES_MOCK=1` по умолчанию: все агенты заглушки, никаких внешних
  вызовов, можно спокойно убедиться что фронт поднялся.
- Старый `46.62.215.11` **не трогается** автоматически — отдельный шаг 4
  аккуратно сносит сабдомен `ai-office.46-62-215-11.nip.io`, когда ты сам
  готов.

## 0. Что должно быть у тебя до старта

- IP нового сервера (`<NEW_IP>`), Ubuntu 24.04 LTS.
- SSH-ключ на новом сервере (`ssh-copy-id`), юзер с `sudo` (или root).
- Открытые порты: 22, 80, 443. Остальное скрипт закроет через `ufw`.
- На ноутбуке: `rsync`, `ssh`, bash.

## 1. Деплой с ноутбука

```bash
cd ~/path/to/ai-command-center
bash apps/ai-sales/scripts/deploy_from_laptop.sh root@<NEW_IP>
# или с другим юзером:
bash apps/ai-sales/scripts/deploy_from_laptop.sh aisales@<NEW_IP>
```

Что делает скрипт:

1. `rsync` всей папки `apps/ai-sales/` на `/opt/ai-sales` (кроме `.env`,
   `__pycache__`, логов и устаревших snapshot-архивов).
2. По SSH запускает на новом сервере `scripts/bootstrap_new_server.sh` под
   sudo.

`bootstrap_new_server.sh`:

- ставит Docker Engine + Compose plugin,
- включает `ufw` (22/80/443) и `fail2ban`,
- спрашивает публичный IP у `api.ipify.org`, собирает домен
  `aisales.<ip-dashed>.nip.io`,
- генерирует `.env` со случайными паролями для Postgres / Redis / MinIO
  (chmod 600),
- `docker compose up -d --build`.

Первый прогон займёт 3–5 минут (пулл образов, build FastAPI). Повторные
прогоны `deploy_from_laptop.sh` — ~секунд десять: rsync инкрементальный,
`.env` на сервере не перезаписывается.

## 2. Проверка

С ноутбука:

```bash
curl -sI https://aisales.<ip-dashed>.nip.io/            # 200 OK
curl -s  https://aisales.<ip-dashed>.nip.io/api/health  # {"status":"healthy"} (если /api/health существует в FastAPI)
```

На сервере:

```bash
ssh <user>@<NEW_IP>
cd /opt/ai-sales/code
cat .env                                  # посмотреть сгенерированные пароли
docker compose ps                         # все 6 сервисов healthy
docker compose logs -f api caddy          # первый Let's Encrypt cert
```

Пока `AISALES_MOCK=1` — реальных вызовов нет, это специально.

## 3. Переключение из mock в прод (когда готов)

```bash
ssh <user>@<NEW_IP>
cd /opt/ai-sales/code
sudo vim .env
# заполнить:
#   ANTHROPIC_API_KEY, VOYAGE_API_KEY, OPENAI_API_KEY
#   ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
#   TG_BOT_TOKEN, ILYA_TG_CHAT_ID
#   IG_APP_SECRET, IG_PAGE_TOKEN   (если включаешь IG-канал)
# переключить:
#   AISALES_MOCK=0

sudo docker compose up -d --force-recreate api
```

Миграции БД применятся на первом запуске контейнера `postgres` из
`04-database/*.sql` (bind-mount в `docker-entrypoint-initdb.d/`). На
чистом деплое БД пустая — что и просилось.

## 4. Снести старый сабдомен `ai-office.46-62-215-11.nip.io`

Делается отдельно и только когда новый сервер уже отвечает. Со
старого Hetzner (46.62.215.11):

```bash
ssh aisales@46.62.215.11
# сначала dry-run, чтобы увидеть, что скрипт собирается тронуть:
curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/claude/project-status-dashboard-XYcEP/apps/ai-sales/scripts/teardown_old_ai_office_subdomain.sh \
  | sudo DRY_RUN=1 bash
# если ok — применяем:
curl -fsSL https://raw.githubusercontent.com/kleber2009-alt/ai-command-center/claude/project-status-dashboard-XYcEP/apps/ai-sales/scripts/teardown_old_ai_office_subdomain.sh \
  | sudo bash
```

Или залить его туда через `scp` и запустить локально, если прямого
`curl` на GitHub со старого сервера нет.

Скрипт:

- бэкапит системный `/etc/caddy/Caddyfile` (+ `conf.d/*.conf`),
- вырезает любой блок `ai-office*.nip.io { … }`,
- удаляет `/srv/ai-office` (если был статик там),
- reload-ит системный Caddy и `aisales-caddy` в docker-compose,
- если ai-office был вшит в чужой `docker-compose.yml` — не редактирует
  его, только помечает путь, чтобы ты посмотрел руками.

`ai-sales` на старом сервере, его базу данных и `api.46-62-215-11.nip.io`
скрипт не трогает — всё это продолжает работать до тех пор, пока ты сам
не решишь выключить старую коробку.

## 5. Откат

Если на новом сервере что-то пошло не так:

```bash
ssh <user>@<NEW_IP>
cd /opt/ai-sales/code
docker compose down -v                 # -v сносит volumes тоже
sudo rm -rf /opt/ai-sales
# и повторный deploy_from_laptop.sh с ноутбука
```

Старый прод никак не затрагивается шагом 1–3 — его можно оставить как
hot standby пока не переключишь DNS / webhooks.

## Куда указать webhook-и, когда переключаешься в прод

| Канал | Куда ставить |
| --- | --- |
| Telegram setWebhook | `https://aisales.<ip-dashed>.nip.io/webhooks/telegram` |
| Instagram Graph callback | `https://aisales.<ip-dashed>.nip.io/webhooks/instagram` |

(подробнее — `apps/ai-sales/scripts/setup_tg_webhook.sh`,
`apps/ai-sales/code/webhooks/`).

## Что из этого будет жить в git

Все скрипты и этот runbook уже в `apps/ai-sales/scripts/`.
`setup_ssl_nip_io.sh` оставлен как fallback (ставит системный Caddy, а
не внутри Compose — пригодится, если когда-то захочешь уйти от
docker-compose) — но для текущего сценария используется связка
`deploy_from_laptop.sh` + `bootstrap_new_server.sh`.
