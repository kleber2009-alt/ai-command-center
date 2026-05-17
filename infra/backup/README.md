# Backup setup — Postgres + voice-notes → S3

Резервное копирование БД и сгенерированных audio-файлов на любое S3-совместимое хранилище через `rclone`. Запускается хостовым cron'ом, не зависит от Docker compose.

## Что бэкапится

| Что | Куда | Когда | Размер (растёт) |
|---|---|---|---|
| `pg_dump` всех таблиц (`voices`, `leads`, `transcripts`, `voice_generations`, `voice_bot_users`, `voice_binding_tokens`, `voice_relay_inbound`) | `s3:<bucket>/aio/db/YYYY-MM-DD-HHMMSS.sql.gz` | каждый день 03:00 UTC | от ~1 KB, медленно растёт |
| Generated voice-notes (mp3) | `s3:<bucket>/aio/voice-notes/<owner>/<ts>.mp3` | каждый час delta-sync | в среднем 50-200 KB на каждый voice-note |

**Retention:** 30 daily snapshots БД (старше — удаляются автоматом). Voice-notes — без авторетеншена (положи lifecycle policy на bucket если нужно).

---

## Setup за 5 минут

### 1. Создать bucket у провайдера

**Вариант A — Selectel S3** (российская юрисдикция, ~1₽/GB/мес):
1. Заведи [my.selectel.ru](https://my.selectel.ru/) → Object Storage → Containers → **Create container**
2. Name: `aio-backups` (или любое уникальное), Type: **Private**
3. Account & Roles → Service Users → **Create user** → role `Object Storage Admin` → запиши ключи

**Вариант B — Backblaze B2** ($0.006/GB/мес, дешевле):
1. [backblaze.com/b2/](https://secure.backblaze.com/) → Buckets → **Create a Bucket**
2. Name: `aio-backups`, Files: **Private**
3. App Keys → **Add a New Application Key** → запиши `keyID` и `applicationKey`

### 2. Установить rclone на сервере

```bash
apt update && apt install -y rclone curl jq
rclone --version  # должно быть >= 1.62
```

### 3. Сконфигурировать rclone

```bash
mkdir -p ~/.config/rclone
cp /root/ai-command-center/infra/backup/rclone.conf.example ~/.config/rclone/rclone.conf
nano ~/.config/rclone/rclone.conf
# Раскомментируй секцию своего провайдера, подставь access_key_id + secret
```

Проверь:
```bash
rclone lsd s3:                       # должен показать список bucket'ов
rclone mkdir s3:aio-backups          # создаст если нет (или silently ok)
rclone ls s3:aio-backups             # пусто на старте
```

### 4. Сделать скрипты исполняемыми

```bash
chmod +x /root/ai-command-center/infra/backup/*.sh
```

### 5. Прогнать вручную для проверки

```bash
/root/ai-command-center/infra/backup/backup-db.sh
```

Должно отработать за ~2-5 секунд:
```
[backup-db] dumping aio from infra-postgres-1…
[backup-db] dump 8 KB
[backup-db] uploading to s3:aio-backups/aio/db/2026-05-17-XXXX.sql.gz…
[backup-db] pruning files older than 30 days…
[backup-db] done
```

Плюс в Telegram прилетит `✅ Бэкап БД: aio-db-2026-05-17-XXXX.sql.gz (8KB)`.

Аналогично voice-notes:
```bash
/root/ai-command-center/infra/backup/backup-voice-notes.sh
```

### 6. Поставить cron

```bash
crontab -e
```

Вставь содержимое `cron.example`. Сохрани.

Проверь:
```bash
crontab -l
```

Логи будут в `/var/log/aio-backup-db.log` и `/var/log/aio-backup-vn.log`.

---

## Восстановление

### БД

```bash
# Последний бэкап
/root/ai-command-center/infra/backup/restore-db.sh

# Конкретный файл
/root/ai-command-center/infra/backup/restore-db.sh aio-db-2026-05-15-030001.sql.gz
```

Скрипт спросит подтверждение перед тем как ПЕРЕЗАПИСАТЬ текущую БД (`--clean --if-exists` в pg_dump — все существующие таблицы дропаются).

### Voice-notes

```bash
# Восстановить все
mount_path=$(docker inspect -f '{{ range .Mounts }}{{ if eq .Destination "/data/voice-notes" }}{{ .Source }}{{ end }}{{ end }}' infra-ai-office-1)
rclone copy s3:aio-backups/aio/voice-notes "$mount_path"

# Восстановить только одного владельца
rclone copy s3:aio-backups/aio/voice-notes/@ilia_paliy "$mount_path/@ilia_paliy"
```

---

## Мониторинг

Скрипты шлют в Telegram через `/api/notify-tg`:
- ✅ при успехе (только для backup-db.sh — voice-notes ежечасно слишком шумно)
- ❌ при ошибке (pg_dump failed / rclone upload failed)

Если хочешь убрать success-уведомления (только failure):
```bash
sed -i '/Бэкап БД:/d' /root/ai-command-center/infra/backup/backup-db.sh
```

---

## Стоимость

Допустим, БД на 100MB, voice-notes 5GB:
- Selectel: ~5₽/мес за всё
- Backblaze: ~$0.03/мес за всё

Pro-tip: можно настроить **lifecycle policy** на bucket чтобы старые voice-notes автоматически архивировались в Glacier/Cold storage (Selectel/AWS) после 30 дней — ещё в 5-10 раз дешевле.

---

## Что НЕ бэкапится (и почему)

- **Docker images** — пересобираются из git за 30 сек
- **`.env`** — секреты, не должны попадать в S3. Храни в менеджере паролей (1Password / Bitwarden)
- **Caddy certs** — Let's Encrypt перевыпустит за 15 сек на новом сервере
- **node_modules / build artifacts** — генерируется автоматом при `docker compose up --build`
- **Существующий aisales-* стек** — он не наш, делай отдельный backup

Чтобы восстановить весь проект на новом сервере:
1. SSH, `git clone`, скопировать `.env` из менеджера паролей
2. `docker compose up -d --build`
3. `restore-db.sh latest`
4. `rclone copy s3:aio-backups/aio/voice-notes <volume_path>`

Полный recovery занимает ~15 минут.
