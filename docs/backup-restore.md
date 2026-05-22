# Бэкапы и восстановление — runbook

Полная процедура. TL;DR и конфиг — в `CLAUDE.md`, секция «Бэкапы». Сюда заходим только когда нужно реально восстанавливать.

## Что бэкапится

| Pipeline | Источник | Артефакт |
|---|---|---|
| `pg_backup` (см. ниже Сценарии A/B) | БД `aisales` | `aisales-YYYY-MM-DD-HHMMSS.dump.gz` в MinIO `aisales-postgres-backups` |
| `aux_backup` (Сценарий C) | `infra-postgres-1` + SQLite `tg-agent` + SQLite `infra-transcribe-1` + том `infra_voice_notes` | один `aux-YYYY-MM-DD-HHMMSS.tar.gz` в MinIO `aisales-aux-backups` |

## Что НЕ бэкапится (намеренно)

- `aisales-qdrant` — пусто на 2026-05-19 (нет коллекций). Перестраивается из `aisales` postgres когда появятся.
- `aisales-redis` — кэш/очереди, прод-данные не хранит критично; при ресторе будут «холодные» очереди.
- MinIO bucket `aisales-media` — пусто на 2026-05-19. Pipeline отложен до появления данных (см. `NOTES.md`, секция «TODO · MinIO `aisales-media` backup»).

## Креды

- MinIO service-account `backup-pg-aisales` — в 1Password как «MinIO — backup-pg-aisales». Policy `backup-pg-aisales-policy`: только `ListBucket/GetBucketLocation` + `PutObject/GetObject` на `aisales-postgres-backups`. `DeleteObject` **намеренно не дан** — антитampering, удаление через lifecycle.
- На проде: `/home/aisales/.config/aisales/backup.env` (chmod 600).
- MinIO root-креды — в env контейнера `aisales-minio` (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`).

## Алерты

[healthchecks.io](https://healthchecks.io) — pinger из скрипта:
- `/start` — старт бэкапа
- `/{uuid}` — успех
- `/fail` — провал, с `tail -50` лога в теле запроса

URL живёт в `backup.env` как `HEALTHCHECK_URL`. Алерт сработает, если ежедневного `success` не приходит — period настраивается на стороне healthchecks.io.

## Сценарий A — аудит вчерашнего бэкапа в тестовой БД

Безопасный режим: оригинальная `aisales` не трогается. Используется чтобы проверить что бэкап вообще восстанавливается, или достать данные на сравнение.

```bash
ssh prod
set -euo pipefail
WORK=/tmp/aisales-restore-test && mkdir -p "$WORK" && chmod 700 "$WORK"

# 1. вытащить последний объект из MinIO
. /home/aisales/.config/aisales/backup.env
ENDPOINT=${MINIO_ENDPOINT#http://}
OBJ=$(docker exec -e MC_HOST_b="http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@${ENDPOINT}" \
  aisales-minio mc ls --json "b/${MINIO_BUCKET}/" \
  | python3 -c "import sys,json; o=[json.loads(l) for l in sys.stdin if l.strip()]; o.sort(key=lambda x:x['lastModified']); print(o[-1]['key'])")
docker exec -e MC_HOST_b="http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@${ENDPOINT}" \
  aisales-minio mc cat "b/${MINIO_BUCKET}/${OBJ}" > "$WORK/${OBJ}"
gunzip -c "$WORK/${OBJ}" > "$WORK/dump.pgc"

# 2. пустая тестовая БД + restore
docker exec aisales-postgres psql -U aisales -d postgres -c \
  "CREATE DATABASE aisales_restore_test WITH OWNER aisales TEMPLATE template0;"
docker cp "$WORK/dump.pgc" aisales-postgres:/tmp/dump.pgc
docker exec aisales-postgres pg_restore -U aisales -d aisales_restore_test \
  --no-owner --no-privileges --exit-on-error -j 2 /tmp/dump.pgc
docker exec aisales-postgres rm -f /tmp/dump.pgc

# 3. посмотреть/сравнить:
docker exec aisales-postgres psql -U aisales -d aisales_restore_test -c "\dt"

# 4. убрать за собой (требует подтверждения пользователя — write op):
docker exec aisales-postgres psql -U aisales -d postgres -c "DROP DATABASE aisales_restore_test;"
rm -rf "$WORK"
```

## Сценарий B — restore в продовую `aisales` (disaster recovery)

> ⚠ **Уничтожает текущую aisales БД.** Делать только если оригинал реально испорчен. Каждый шаг — с подтверждением пользователя.

```bash
ssh prod

# 1. остановить запись в БД (иначе кто-то напишет в момент DROP):
docker stop aisales-api-v2 tg-agent aisales-command-center
# проверить что больше никто не подключён:
docker exec aisales-postgres psql -U aisales -d postgres -c \
  "SELECT pid, usename, application_name, state FROM pg_stat_activity WHERE datname='aisales';"
# если остались прикладные pid — kill через
# SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='aisales' AND pid<>pg_backend_pid();

# 2. подготовить дамп — шаги 1 из Сценария A

# 3. удалить существующую aisales:
docker exec aisales-postgres psql -U aisales -d postgres -c "DROP DATABASE aisales;"

# 4. создать пустую и восстановить:
docker exec aisales-postgres psql -U aisales -d postgres -c \
  "CREATE DATABASE aisales WITH OWNER aisales TEMPLATE template0;"
docker cp "$WORK/dump.pgc" aisales-postgres:/tmp/dump.pgc
docker exec aisales-postgres pg_restore -U aisales -d aisales \
  --no-owner --no-privileges --exit-on-error -j 2 /tmp/dump.pgc

# 5. вернуть гранты для claude_ro (template0 их не имеет):
docker exec aisales-postgres psql -U aisales -d aisales <<'SQL'
GRANT CONNECT ON DATABASE aisales TO claude_ro;
GRANT USAGE ON SCHEMA public TO claude_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_ro;
SQL

# 6. смок-тест:
docker exec aisales-postgres psql -U claude_ro -d aisales -c "SELECT count(*) FROM conversations;"

# 7. запустить приложение обратно:
docker start aisales-api-v2 tg-agent aisales-command-center
docker exec aisales-postgres rm -f /tmp/dump.pgc
```

`pg_dump --format=custom` восстанавливается **только** через `pg_restore`, не через `psql` — это бинарный формат.

## Сценарий C — восстановление aux-слоёв (по одному)

`aux-YYYY-MM-DD-HHMMSS.tar.gz` — один общий архив со всеми aux-артефактами. Внутри:

```
MANIFEST.txt
infra-postgres.dump.gz      # pg_dump --format=custom БД aio
tg-agent.db.gz              # sqlite3 .backup
infra-transcribe.db.gz      # sqlite3 .backup  (опционально, если БД создавалась)
infra-voice-notes.tar.gz    # tar -czf тома infra_voice_notes
```

Восстановление выборочное — распаковываем нужный слой, остальные не трогаем.

```bash
ssh prod
WORK=/tmp/aux-restore && mkdir -p "$WORK" && chmod 700 "$WORK"

# 1. вытащить последний aux-архив из MinIO (через mc внутри aisales-minio)
. /home/aisales/.config/aisales/aux-backup.env
ENDPOINT=${MINIO_ENDPOINT#http://}
OBJ=$(docker exec -e MC_HOST_b="http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@${ENDPOINT}" \
  aisales-minio mc ls --json "b/${MINIO_BUCKET}/" \
  | python3 -c "import sys,json; o=[json.loads(l) for l in sys.stdin if l.strip()]; o.sort(key=lambda x:x['lastModified']); print(o[-1]['key'])")
docker exec -e MC_HOST_b="http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@${ENDPOINT}" \
  aisales-minio mc cat "b/${MINIO_BUCKET}/${OBJ}" > "$WORK/${OBJ}"
tar -C "$WORK" -xzf "$WORK/${OBJ}"
cat "$WORK/MANIFEST.txt"
```

### C.1 — restore `infra-postgres-1` (AIO БД)

⚠ требует подтверждения пользователя (write op).

```bash
docker exec infra-postgres-1 psql -U aio -d postgres -c \
  "CREATE DATABASE aio_restore_test WITH OWNER aio TEMPLATE template0;"
gunzip -c "$WORK/infra-postgres.dump.gz" > "$WORK/aio.pgc"
docker cp "$WORK/aio.pgc" infra-postgres-1:/tmp/aio.pgc
docker exec infra-postgres-1 pg_restore -U aio -d aio_restore_test \
  --no-owner --no-privileges --exit-on-error -j 2 /tmp/aio.pgc
docker exec infra-postgres-1 psql -U aio -d aio_restore_test -c "\dt"
# проверили — дропать тест и заменять прод по аналогии со Сценарием B
```

### C.2 — restore SQLite (`tg-agent` или `infra-transcribe-1`)

```bash
# распаковали .db.gz рядом
gunzip -k "$WORK/tg-agent.db.gz"     # → tg-agent.db
# проверить целостность:
sqlite3 "$WORK/tg-agent.db" "PRAGMA integrity_check;"
sqlite3 "$WORK/tg-agent.db" ".tables"

# восстановление в прод-контейнер (write op, подтверждение пользователя!):
docker stop tg-agent
docker cp "$WORK/tg-agent.db" tg-agent:/app/data/tg-agent.db
# удалить старые WAL/SHM (иначе SQLite попытается доиграть несовместимый WAL):
docker exec -u root tg-agent sh -c "rm -f /app/data/tg-agent.db-wal /app/data/tg-agent.db-shm"
docker start tg-agent
docker logs --tail 30 tg-agent
```

### C.3 — restore `infra_voice_notes` volume

```bash
# содержимое тома:
tar -tzf "$WORK/infra-voice-notes.tar.gz" | head

# восстановление (write op):
docker stop infra-ai-office-1
docker run --rm -v infra_voice_notes:/data -v "$WORK":/in alpine:3.19 \
  sh -c 'cd /data && rm -rf ./* ./.[!.]* 2>/dev/null; tar -xzf /in/infra-voice-notes.tar.gz'
docker start infra-ai-office-1
```

## Проверки работоспособности

```bash
ssh prod 'docker exec aisales-minio mc ls local/aisales-postgres-backups/ | tail'   # свежий pg_backup в MinIO
ssh prod 'docker exec aisales-minio mc ls local/aisales-aux-backups/ | tail'        # свежий aux_backup в MinIO
ssh prod 'ls -la /home/aisales/backups/aisales-postgres/ | tail'                    # локальная копия pg_backup
ssh prod 'ls -la /home/aisales/backups/aux/ | tail'                                 # локальная копия aux_backup
ssh prod 'tail -30 /home/aisales/logs/pg_backup.log'
ssh prod 'tail -30 /home/aisales/logs/aux_backup.log'
ssh prod 'ls /home/aisales/backups/aisales-postgres/*.tmp /home/aisales/backups/aux/*.tmp 2>/dev/null || echo OK'
```
