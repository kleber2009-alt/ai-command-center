# 🚀 Deploy Guide · разворачивание на сервере

**Версия:** v1.0 · 16 мая 2026

Тут — пошаговая инструкция как развернуть `aisales-api` на твоём Hetzner VPS.

---

## TL;DR (если сервер уже настроен)

```bash
ssh aisales@<SERVER_IP>
cd ~/aisales
git pull            # или скопируй файлы из бэкапа
cd code
cp .env.example .env
nano .env           # подставь свои ключи
docker compose build api
docker compose up -d api
docker compose logs -f api
```

Проверь: `http://localhost:8000/health` через SSH-туннель.

---

## 1. Что нужно на сервере

✅ Docker + docker compose v2
✅ Запущенные контейнеры: postgres, redis, qdrant, minio (если поставил по `02-stage-instructions/`)
✅ Пользователь `aisales` с правами доступа к Docker

Если ничего нет — смотри `02-stage-instructions/stage-2-1-vps.html` и `stage-2-2-docker.html`.

---

## 2. Скопировать код на сервер

### Вариант A: через git (рекомендую)

```bash
# на маке создать репо если ещё нет
cd ~/ai-sales-system
git init
git add .
git commit -m "initial"
# push на GitHub private repo

# на сервере
ssh aisales@<SERVER_IP>
cd ~
git clone git@github.com:<your>/ai-sales-system.git aisales
```

### Вариант B: через rsync

```bash
# с мака — копируем всё кроме venv/node_modules/.git
rsync -avz --exclude='code/venv' --exclude='__pycache__' --exclude='.git' \
    --exclude='voice-input/audio' --exclude='.DS_Store' \
    ~/ai-sales-system/ aisales@<SERVER_IP>:~/aisales/
```

### Вариант C: через scp .zip
```bash
cd ~/ai-sales-system
zip -r /tmp/aisales.zip . -x 'code/venv/*' '*.pyc' '.git/*' '__pycache__/*'
scp /tmp/aisales.zip aisales@<SERVER_IP>:~
ssh aisales@<SERVER_IP>
unzip -d ~/aisales ~/aisales.zip
```

---

## 3. Настроить .env на сервере

```bash
cd ~/aisales/code
cp .env.example .env
nano .env
```

**Обязательные:**
- `ANTHROPIC_API_KEY` — для агентов
- `POSTGRES_PASSWORD` — должен совпадать с тем что в существующем Postgres
- `REDIS_PASSWORD` — то же самое
- `MINIO_ROOT_PASSWORD` — то же

**Опциональные (когда подключишь):**
- `VOYAGE_API_KEY` — для RAG
- `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` — для голоса
- `IG_*` — для Instagram webhooks
- `TG_BOT_TOKEN` + `TG_WEBHOOK_SECRET` — для Telegram
- `ILYA_TG_CHAT_ID` — твой chat_id для эскалаций

`AISALES_MOCK=0` чтобы вызывать реальные API. `=1` для теста.

---

## 4. Собрать и запустить контейнер

```bash
cd ~/aisales/code
docker compose build api
docker compose up -d api
```

Если другие сервисы (postgres, redis, etc.) уже запущены в отдельном compose — не нужен полный `up -d`. Используй только `api`.

Проверь логи:
```bash
docker compose logs -f api
```

Должен увидеть:
```
🚀 AI Sales API starting up...
✓ Postgres: configured
✓ Redis: configured
✓ IG_MANAGER prompt has 15 placeholders to fill
✓ AI Sales API ready · http://0.0.0.0:8000
```

---

## 5. Применить миграции БД

Если ставишь свежий стек:

```bash
docker compose exec api alembic upgrade head
```

Если БД уже есть со старой схемой — миграции `001` и `003` уже применены через init-скрипты Docker. Просто проверь:

```bash
docker compose exec postgres psql -U aisales -d aisales -c "\dt"
```

Должен увидеть 15+ таблиц.

---

## 6. Проверить здоровье

С мака через SSH-туннель:

```bash
ssh -L 8000:localhost:8000 aisales@<SERVER_IP>
```

В отдельном терминале:

```bash
curl http://localhost:8000/health
# {"status":"healthy","timestamp":1234567890}

curl http://localhost:8000/ready
# {"status":"ready", "checks": {"anthropic":"configured","postgres":"ok",...}}

curl http://localhost:8000/api/v1/agents
# 4 агента в JSON
```

Открыть Swagger в браузере: `http://localhost:8000/docs`

---

## 7. Webhooks (когда дойдём)

### Telegram

1. Создай бота через `@BotFather` → получи `TG_BOT_TOKEN`
2. Добавь в `.env`, перезапусти api
3. Зарегистрируй webhook:
   ```bash
   curl -F "url=https://api.<your-domain>/webhooks/telegram" \
        -F "secret_token=$TG_WEBHOOK_SECRET" \
        "https://api.telegram.org/bot$TG_BOT_TOKEN/setWebhook"
   ```

### Instagram

1. Создай Facebook Business App → Instagram Basic Display + Graph API
2. Получи `IG_APP_SECRET` и `IG_PAGE_TOKEN`
3. В Meta Developer Dashboard → Webhooks → подписаться на `messages`
4. Callback URL: `https://api.<your-domain>/webhooks/instagram`
5. Verify Token: тот же что в `IG_VERIFY_TOKEN`

**ВАЖНО:** webhooks требуют HTTPS — без SSL не зарегистрируются. Реши вопрос со stage 2.5 (Let's Encrypt) перед подключением.

---

## 8. Обновления

```bash
ssh aisales@<SERVER_IP>
cd ~/aisales
git pull                    # или rsync новой версии
cd code
docker compose build api
docker compose up -d api
docker compose logs -f api  # проверь что взлетел
```

---

## 9. Бэкапы

PostgreSQL уже бэкапится автоматически (см. README.md проекта). Логи API:

```bash
docker compose logs api > /tmp/api-logs-$(date +%Y%m%d).log
```

---

## 10. Troubleshooting

**API не стартует** → `docker compose logs api`. Чаще всего: `.env` отсутствует или нет нужных переменных.

**`Postgres connection refused`** → проверь что `aisales-postgres` запущен, и `POSTGRES_URL` указывает на правильный hostname (`postgres` если внутри compose, `localhost` если снаружи).

**Mock-mode не отключается** → `AISALES_MOCK` в `.env` должен быть `0` (не пустой и не `false`).

**Webhooks 401** → проверь `IG_APP_SECRET` или `TG_WEBHOOK_SECRET` — они должны совпадать с настройками в Meta/BotFather.

---

## 11. Smoke-тест перед production

После каждого деплоя:

```bash
# 1. Health
curl -s http://localhost:8000/health | jq

# 2. Ready
curl -s http://localhost:8000/ready | jq

# 3. Mock-flow через API
curl -X POST http://localhost:8000/api/v1/clients/ce-002/intercept

# 4. Логи без ошибок
docker compose logs --tail=50 api | grep -i error
```

Если всё ОК — production ready.
