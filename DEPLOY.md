# Деплой на Hetzner (полный self-hosted стек)

Один Hetzner VPS поднимает весь стек:

```
nginx (80)
├── ai-office  (статика + /api/chat, /api/notify-tg, /api/voice-*)
├── transcribe (Next.js: /transcribe, /me, /api/transcribe*, /api/tasks*)
├── ytdlp      (yt-dlp companion для Instagram/TikTok/X)
└── postgres   (БД с pgvector, бывший Supabase)
```

Никаких внешних managed-сервисов: ни Vercel, ни Netlify, ни Supabase.
Используем только API-ключи: Anthropic, Deepgram, OpenAI (опц.),
ElevenLabs, Telegram Bot.

---

## 1. Hetzner Cloud: подготовка

1. **Создай Cloud Server**: тип CPX21 (3 vCPU / 4 GB RAM, ~€7/мес) или
   CPX31 если планируешь много RAG/эмбеддингов. Образ Ubuntu 22.04+.
2. **SSH-ключ** загрузи в Hetzner Console → SSH Keys, добавь при
   создании сервера.
3. **Cloud Firewall** (Hetzner → Firewalls → New): inbound TCP 22, 80,
   443. Прикрепи к серверу.
4. **(опц.) Volume** для бэкапов Postgres: Hetzner → Volumes, создать
   50–100 GB, прикрепить.
5. **(опц.) Reverse DNS**: Hetzner → Servers → твой сервер → Networking
   → rDNS, прописать домен/имя.

---

## 2. На сервере: системная настройка

```bash
ssh root@<IP>

# Базовые пакеты + docker
apt update && apt -y upgrade
apt -y install docker.io docker-compose-plugin git curl ufw

systemctl enable --now docker

# Firewall на уровне ОС (дублирует Hetzner Cloud Firewall)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Отдельный пользователь, чтобы не работать из-под root
adduser --disabled-password --gecos "" ai
usermod -aG docker ai
mkdir -p /opt/ai-stack
chown -R ai:ai /opt/ai-stack
```

---

## 3. Деплой стека

```bash
su - ai
cd /opt/ai-stack
git clone https://github.com/kleber2009-alt/ai-command-center.git .
git checkout claude/deploy-to-server-bRK1j  # пока стек живёт здесь

cp .env.example .env
nano .env   # см. ключи ниже
```

В `.env` обязательно:

| Переменная | Откуда взять |
|---|---|
| `POSTGRES_PASSWORD` | сильный пароль, любая случайная строка |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `DEEPGRAM_API_KEY`  | console.deepgram.com → API keys |
| `OPENAI_API_KEY`    | platform.openai.com → API keys (только для /me RAG) |
| `ELEVENLABS_API_KEY`| elevenlabs.io → Profile → API key |
| `TG_BOT_TOKEN` + `TELEGRAM_BOT_TOKEN` | @BotFather |
| `TG_CHAT_ID`        | @userinfobot |

Поднимаем:

```bash
docker compose up -d --build
docker compose logs -f --tail=50
```

Проверь:

```bash
curl http://127.0.0.1/healthz                 # {"ok":true,...}
curl http://127.0.0.1/                        # главная ai-office
curl http://127.0.0.1/transcribe              # Next.js страница
curl http://127.0.0.1/api/tasks               # {"items":[],"configured":true}
```

С браузера — `http://<IP-сервера>/`.

---

## 4. Перенос данных из Supabase (если уже было прод)

### 4.1 База данных

Установи на сервере `pg_dump`:

```bash
apt install -y postgresql-client-16
```

Возьми connection string из Supabase: **Project Settings → Database →
Connection string → URI** (формат
`postgres://postgres.PROJECT_REF:PASSWORD@aws-0-eu-...:6543/postgres`).

```bash
cd /opt/ai-stack
export SUPABASE_DB_URL="postgres://postgres.xxx:..."
./scripts/migrate-from-supabase.sh
```

Скрипт сам сделает `pg_dump --data-only` по таблицам приложения и
загрузит результат в локальный Postgres внутри compose. По окончании
печатает строки в каждой таблице.

### 4.2 Голосовые mp3 из Supabase Storage

```bash
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_KEY="eyJhbGc..."   # service_role key
export DATABASE_URL="postgres://ai:$POSTGRES_PASSWORD@127.0.0.1:5432/ai"
# временно пробрось порт postgres наружу:
docker compose -f docker-compose.yml -f - up -d <<EOF
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
EOF

# поставь pg-клиент для node, если ещё нет
node --version  # >= 20
( cd scripts && npm init -y >/dev/null && npm i pg )
node scripts/migrate-storage.mjs

# Скопируй скачанные файлы в volume контейнера ai-office
docker compose cp ./voice-notes-export/. ai-office:/data/voice-notes/
```

### 4.3 Финальный sanity check

```bash
# История транскриптов
curl http://127.0.0.1/api/transcribe/history | jq '.items | length'
# Документы /me
curl http://127.0.0.1/api/me/documents | jq '.items | length'
```

---

## 5. Бэкапы

### Postgres dump nightly (cron):

```bash
sudo crontab -e
# каждый день в 03:00 UTC
0 3 * * * docker exec ai-postgres pg_dump -U ai ai | gzip > /opt/ai-backups/pg-$(date +\%F).sql.gz
```

Если использовал Hetzner Volume — монтируй его в `/opt/ai-backups`.

### voice-notes volume:

```bash
# Локация на хосте:
docker volume inspect ai-command-center_voice-notes | grep Mountpoint
# Бэкап:
tar czf /opt/ai-backups/voice-notes-$(date +%F).tgz \
  -C $(docker volume inspect -f '{{ .Mountpoint }}' ai-command-center_voice-notes) .
```

---

## 6. Обновление

```bash
cd /opt/ai-stack
git pull
docker compose build
docker compose up -d
docker compose ps
```

Миграции схемы прикладываются вручную:
```bash
docker compose exec -T postgres psql -U ai -d ai < db/init/01_schema.sql
```

---

## 7. Когда появится домен

```bash
apt install -y certbot python3-certbot-nginx  # на хосте? — нет, у нас nginx в docker
```

Проще всего: остановить контейнер `nginx`, поставить системный
nginx + certbot и оставить апстримы на 127.0.0.1:8080 (ai-office),
127.0.0.1:3000 (transcribe). Либо использовать
[caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy)
который сам берёт TLS от Let's Encrypt.

Минимальный путь:
```bash
docker compose stop nginx
docker compose rm -f nginx
# открой 80 и 3000/8080 наружу (выставь ports в compose)
apt install -y nginx certbot python3-certbot-nginx
cp /opt/ai-stack/deploy/nginx.conf /etc/nginx/sites-available/ai
# поменяй upstream на 127.0.0.1
ln -sf /etc/nginx/sites-available/ai /etc/nginx/sites-enabled/ai
certbot --nginx -d your-domain.ru
```

---

## 8. Что куда смотрит

| URL | Контейнер |
|---|---|
| `/` | ai-office (`index.html`) |
| `/about`, `/pricing`, `/cases`, … | ai-office (статика) |
| `/admin` | ai-office (`leads-inbox.html`) |
| `/board` | transcribe (`/admin` kanban, через rewrite) |
| `/transcribe` | transcribe (главная страница) |
| `/me`, `/me/library`, `/me/profile` | transcribe |
| `/assistants/*` | transcribe |
| `/api/chat`, `/api/notify-tg`, `/api/voice-*` | ai-office |
| `/api/transcribe*`, `/api/tasks*`, `/api/me*` | transcribe |
| `/files/voice-notes/*` | ai-office (отдаёт mp3 из volume) |
| `/healthz` | ai-office |

---

## 9. Лог-команды

```bash
# Все сервисы
docker compose logs -f --tail=50

# Только Next.js
docker compose logs -f --tail=50 transcribe

# Postgres
docker compose exec postgres psql -U ai -d ai

# Перезапустить один сервис
docker compose restart transcribe
```
