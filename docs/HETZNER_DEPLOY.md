# Hetzner deploy — пошагово

Самый дешёвый рабочий вариант: Hetzner CX22 (€5/мес, 2 vCPU, 4 GB RAM, 40 GB SSD).
Документ предполагает, что у тебя уже есть аккаунт Hetzner Cloud и доменное имя.

## 1. Создать сервер

1. [console.hetzner.cloud](https://console.hetzner.cloud) → **New Project** (если нет) → войти в проект
2. **Add Server**:
   - **Location**: Falkenstein (FSN) или Nuremberg (NBG) — ближе к Европе, дешевле трафик
   - **Image**: Ubuntu 24.04
   - **Type**: CX22 (€5/мес)
   - **SSH Keys**: добавь свой публичный ключ (`cat ~/.ssh/id_ed25519.pub` на твоей машине)
   - **Name**: `ai-command-center`
   - **Create & Buy**
3. Через ~30 секунд сервер готов — скопируй его **публичный IP**.

## 2. DNS

В админке твоего регистратора домена (Cloudflare, Namecheap, REG.RU и т. п.) добавь:

```
A   transcribe   <IP сервера>   TTL 5 min
```

(или просто корневую запись `@`, если хочешь домен без префикса)

Подожди 5-10 минут, проверь через `dig transcribe.example.com +short` — должен показать твой IP.

## 3. Первичная настройка сервера

С твоего компа:

```bash
ssh root@<IP>
```

На сервере:

```bash
# Базовая безопасность
apt update && apt upgrade -y
apt install -y ufw fail2ban
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw --force enable

# Docker
curl -fsSL https://get.docker.com | sh

# Пользователь (опционально — но не работать рутом)
adduser --disabled-password --gecos "" app
usermod -aG docker app
cp -r ~/.ssh /home/app/
chown -R app:app /home/app/.ssh

# Выход и перелогин под app
exit
ssh app@<IP>
```

## 4. Клонирование и старт

```bash
git clone https://github.com/kleber2009-alt/ai-command-center.git
cd ai-command-center

# Заполнить .env
cp .env.example .env
nano .env
```

В `.env` обязательно:

```bash
DOMAIN=transcribe.example.com           # твой реальный домен
POSTGRES_PASSWORD=$(openssl rand -hex 24)  # сгенерируй на сервере
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
YTDLP_SERVICE_API_KEY=$(openssl rand -hex 32)
OPENAI_API_KEY=sk-...                   # опционально, для /me embeddings
```

Запуск:

```bash
docker compose up -d --build
docker compose logs -f app   # Ctrl-C чтобы выйти из логов
```

Caddy сам подтянет Let's Encrypt сертификат при первом HTTPS-запросе (нужно ~10 секунд).
Postgres миграции применятся автоматически при первом старте контейнера.

## 5. Проверка

```bash
curl -I https://transcribe.example.com
# должен вернуть HTTP/2 307 → /transcribe
```

Открой `https://transcribe.example.com/transcribe` в браузере — должна загрузиться страница.

## 6. Подключить Telegram Mini App

В Telegram → [@BotFather](https://t.me/BotFather) → `/mybots` → твой бот → **Bot Settings** → **Menu Button** → **Configure menu button** → URL = `https://transcribe.example.com/transcribe`.

## 7. Перенести данные из Supabase (если есть)

На своей машине:

```bash
# Получить connection string из Supabase Dashboard
# → Project Settings → Database → Connection string → URI

# Тоннель к Postgres внутри VPS
ssh -L 5433:localhost:5432 app@<IP>
# (оставь это окно открытым)
```

В другом окне:

```bash
SUPABASE_DB_URL="postgresql://postgres.xxx:pwd@aws-0-...pooler.supabase.com:5432/postgres" \
TARGET_DB_URL="postgres://app:<POSTGRES_PASSWORD из .env>@localhost:5433/app" \
  ./scripts/migrate-from-supabase.sh
```

Скрипт сделает `pg_dump --data-only` для 5 наших таблиц и зальёт в новую БД.

## 8. Бэкапы

Скрипт `scripts/backup-db.sh` уже в репо. Cron-задание:

```cron
0 4 * * * /home/app/ai-command-center/scripts/backup-db.sh >> /home/app/logs/backup.log 2>&1
```

```bash
mkdir -p ~/backups ~/logs
crontab -e   # вставь строку выше
```

Скрипт делает `pg_dump | gzip` в `~/backups/db-<timestamp>.sql.gz` и удаляет файлы старше 30 дней.

Восстановить из дампа: `./scripts/restore-db.sh ~/backups/db-XXXX.sql.gz`.

Для оффсайт-копий — `restic` или `rclone` на любой S3-совместимый бакет.

## 9. Обновления кода

```bash
ssh app@<IP>
cd ai-command-center
git pull
docker compose up -d --build app   # пересоберёт только Next.js
```

`db`, `ytdlp`, `caddy` останутся работать с теми же volumes.

## Стоимость

| Статья | $/мес |
|---|---|
| Hetzner CX22 | ~5 |
| Домен | ~1 (если новый, .com за $12/год) |
| Anthropic API | по использованию (~$1-10 для умеренного трафика) |
| Deepgram API | $0.0043/мин аудио |
| OpenAI embeddings | $0.02/1M токенов (~$0.50 за тысячу документов) |
| **Итого** | **~$6-15/мес** |

Railway для yt-dlp можно оставить ($5/мес), или поднять yt-dlp на этом же VPS отдельным сервисом docker-compose — он уже там, просто не запущен по умолчанию.
