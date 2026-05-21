# AI Creative Hub · Production Deploy Checklist

> Все команды — на проде через `ssh root@46.62.215.11`. Перед каждым шагом проверь backup-копию.
> Бэкапы конфигов сохраняй ≥7 дней (политика CLAUDE.md).

**Что уже сделано на проде (этап 5/10 → в работе):**

- ✅ БД `ai_hub` создана в `aisales-postgres`, 13 таблиц + 4 SQL-функции + триггер `on_user_created` применены
- ✅ Seed заполнен (13 tools, 4 token packages)
- ✅ MinIO bucket `ai-hub-media` создан в `aisales-minio`
- ✅ Backup конфигов снят: `/home/aisales/scripts/pg_backup.sh.bak.20260519_093701` + `/home/aisales/.config/aisales/backup.env.bak.20260519_093701`
- ✅ Лендинг live на `https://aihub.46-62-215-11.nip.io` (не трогаем)

**Осталось сделать:**

## 1. Расширить pg_backup для второй БД

Дамп `ai_hub` сейчас НЕ покрыт ночным бэкапом — `pg_backup.sh` хардкодит `PG_DB=aisales`. Патч добавляет цикл по `PG_DBS` (space-separated список) ПОСЛЕ основного бэкапа. Ошибка в extra-БД не валит весь скрипт.

```bash
ssh root@46.62.215.11
# (бэкап уже есть: /home/aisales/scripts/pg_backup.sh.bak.20260519_093701)

# 1a. Применить patch (см. ниже PATCH) — вставляет блок ПЕРЕД финальным hc "${HEALTHCHECK_URL}"
nano /home/aisales/scripts/pg_backup.sh
# вставить перед последней строкой `hc "${HEALTHCHECK_URL}"` блок из секции PATCH ↓

# 1b. Добавить список БД в env
echo 'PG_DBS="ai_hub"' >> /home/aisales/.config/aisales/backup.env

# 1c. Прогнать вручную (можно одной БД, чтобы убедиться что extra-блок работает)
sudo -u aisales /home/aisales/scripts/pg_backup.sh
tail -30 /home/aisales/logs/pg_backup.log
# должно быть: "OK aisales-…" + "OK ai_hub-…" в одном прогоне

# 1d. Проверить что объект ai_hub-* появился в MinIO
docker exec aisales-minio mc ls local/aisales-postgres-backups/ | grep ai_hub
```

### PATCH для pg_backup.sh

Вставить **перед** последней строкой `hc "${HEALTHCHECK_URL}"`:

```bash
# === extra DBs from PG_DBS (space-separated). Failures here don't kill the run.
for extra_db in ${PG_DBS:-}; do
  [[ "$extra_db" == "$PG_DB" ]] && continue                  # avoid double-dump of main DB

  EXTRA_OBJ="${extra_db}-${TS}.dump.gz"
  EXTRA_LOCAL="${LOCAL_BACKUP_DIR}/${EXTRA_OBJ}"
  EXTRA_TMP="${EXTRA_LOCAL}.tmp"
  log "START extra backup ${EXTRA_OBJ}"

  if ! docker exec "$PG_CONTAINER" pg_dump --format=custom -U "$PG_USER" "$extra_db" \
         | gzip -9 > "$EXTRA_TMP"; then
    log "WARN: ${extra_db} pipeline failed PIPESTATUS=(${PIPESTATUS[*]:-?}) — skipping"
    rm -f "$EXTRA_TMP" 2>/dev/null || true
    continue
  fi

  EXTRA_SIZE=$(stat -c%s "$EXTRA_TMP" 2>/dev/null || echo 0)
  if (( EXTRA_SIZE < MIN_SIZE )); then
    log "WARN: ${extra_db} dump too small (${EXTRA_SIZE}B) — skipping"
    rm -f "$EXTRA_TMP"; continue
  fi

  EXTRA_MAGIC=$( { gunzip -c "$EXTRA_TMP" 2>/dev/null || true; } | head -c 5 )
  if [[ "$EXTRA_MAGIC" != "PGDMP" ]]; then
    log "WARN: ${extra_db} missing PGDMP magic — skipping"
    rm -f "$EXTRA_TMP"; continue
  fi

  if ! docker exec -e MC_HOST_backup="$MC_HOST_VAL" -i aisales-minio \
         mc pipe "backup/${MINIO_BUCKET}/${EXTRA_OBJ}" < "$EXTRA_TMP"; then
    log "WARN: ${extra_db} upload failed"; continue
  fi

  mv "$EXTRA_TMP" "$EXTRA_LOCAL"
  find "$LOCAL_BACKUP_DIR" -maxdepth 1 -name "${extra_db}-*.dump.gz" \
    -mtime +"$LOCAL_RETENTION_DAYS" -delete 2>/dev/null || true
  log "OK ${EXTRA_OBJ} size=${EXTRA_SIZE}B"
done
```

**Почему `continue`, а не `false`:** основной бэкап `aisales` критичен и должен пройти всегда. Падение extra-DB логируется (`WARN`) но не убивает скрипт. Healthchecks при этом дойдёт до success-пинга.

**Откат:** `cp /home/aisales/scripts/pg_backup.sh.bak.20260519_093701 /home/aisales/scripts/pg_backup.sh`.

## 2. Получить env keys

Контейнер не запустится без них. Сложить в `/home/aisales/ai-hub/.env.production` (chmod 600):

| Var | Где взять | Обязателен? |
|---|---|---|
| `DATABASE_URL` | `postgres://aisales:<password>@aisales-postgres:5432/ai_hub` (пароль из `aisales-postgres` env-файла) | ✅ |
| `REDIS_URL` | `redis://aisales-redis:6379/1` (БД 1 — не 0, чтобы не пересекаться с aisales) | ✅ |
| `S3_ENDPOINT` | `http://aisales-minio:9000` (внутри сети) | ✅ |
| `S3_BUCKET` | `ai-hub-media` (уже создан) | ✅ |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | из env-файла `aisales-minio` контейнера | ✅ |
| `AUTH_SECRET` | сгенерить: `openssl rand -base64 32` | ✅ |
| `NEXTAUTH_URL` | `https://aihub-app.46-62-215-11.nip.io` | ✅ |
| `NEXT_PUBLIC_APP_URL` | то же | ✅ |
| `SMTP_URL` | Resend / Postmark / SES. Пример Resend: `smtp://resend:re_xxxxxxxx@smtp.resend.com:587` | ✅ |
| `SMTP_FROM` | `AI Creative Hub <no-reply@yourdomain.com>` (домен надо верифицировать в Resend) | ✅ |
| `FAL_KEY` | https://fal.ai/dashboard/keys — покрывает FLUX/Kling/Nano Banana/BiRefNet (9 моделей) | ✅ |
| `REPLICATE_API_TOKEN` | https://replicate.com/account/api-tokens — покрывает Real-ESRGAN/Clarity/Face Swap | ✅ |
| `FAL_WEBHOOK_SECRET` | fal dashboard → Webhooks → signing secret | ✅ |
| `REPLICATE_WEBHOOK_SECRET` | https://replicate.com/account/webhook (`whsec_…` base64) | ✅ |
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com/apikeys (live key) | ✅ для платежей |
| `STRIPE_WEBHOOK_SECRET` | после создания webhook → endpoint `https://aihub-app.46-62-215-11.nip.io/api/webhooks/stripe` | ✅ для платежей |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | dashboard → API keys → publishable | ✅ для платежей |
| `PROVIDER_WEBHOOK_BASE_URL` | `https://aihub-app.46-62-215-11.nip.io` | ✅ |
| `LOG_LEVEL` | `info` (или `debug` для дебага) | необязательно |

## 3. Залить код на прод

```bash
# Локально:
rsync -av --exclude node_modules --exclude .next ./ai-hub/ \
  root@46.62.215.11:/root/ai-command-center/apps/ai-hub/

# На проде:
ssh root@46.62.215.11
cd /root/ai-command-center/apps/ai-hub/

# Положить env-файл (содержимое из шага 2):
nano .env.production
chmod 600 .env.production
```

## 4. Собрать образы и применить миграции

```bash
cd /root/ai-command-center/apps/ai-hub/

# Билд (~5-10 мин, npm ci + next build)
docker compose --env-file .env.production build

# Миграции уже накачены вручную в шаге Done, но на свежей БД повторно — идемпотентно
docker compose --env-file .env.production run --rm ai-hub-worker npx tsx scripts/migrate.ts
docker compose --env-file .env.production run --rm ai-hub-worker npx tsx scripts/seed.ts
```

## 5. Запустить

```bash
docker compose --env-file .env.production up -d
docker compose ps                                          # должно быть 2 контейнера в "running"
docker compose logs -f ai-hub-web    --tail 50             # должно: "Ready in Xms"
docker compose logs -f ai-hub-worker --tail 50             # должно: "worker ready" + "watchdog started"
```

## 6. Caddy: добавить блок для приложения

```bash
ssh root@46.62.215.11
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%Y%m%d_%H%M%S)
touch /var/log/caddy/ai-hub-app.log
chown caddy:caddy /var/log/caddy/ai-hub-app.log         # КРИТИЧНО, иначе reload падает
```

Добавить в конец `/etc/caddy/Caddyfile`:

```
# ============ AI Creative Hub · App (Next.js) ============
aihub-app.46-62-215-11.nip.io {
  reverse_proxy 127.0.0.1:3010
  log {
    output file /var/log/caddy/ai-hub-app.log
    format console
  }
  header {
    Strict-Transport-Security "max-age=63072000"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
  # Stripe webhook posts large payloads
  request_body { max_size 10MB }
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
curl -sI https://aihub-app.46-62-215-11.nip.io/api/health        # ожидаем 200
```

## 7. Сделать себя админом

```bash
docker exec aisales-postgres psql -U aisales -d ai_hub -c \
  "UPDATE users SET role='admin' WHERE email='ilia.paliy@icloud.com';"
# проверить:
docker exec aisales-postgres psql -U aisales -d ai_hub -c \
  "SELECT email, role FROM users WHERE role='admin';"
```

После этого https://aihub-app.46-62-215-11.nip.io/admin откроется (под этим email через magic-link).

## 8. Зарегистрировать webhooks у провайдеров

| Провайдер | URL | Event filter |
|---|---|---|
| fal.ai | (передаём в каждом submit через `fal_webhook` query, не глобально) | — |
| Replicate | https://replicate.com/account/webhook | `prediction.completed` |
| Stripe | https://dashboard.stripe.com/webhooks → Add endpoint | `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed` |

URL для всех: `https://aihub-app.46-62-215-11.nip.io/api/webhooks/<provider>` (для Replicate путь: `…/api/webhooks/providers/replicate`, для Stripe: `…/api/webhooks/stripe`).

Secrets из этих регистраций → в `.env.production` → `docker compose up -d` (рестарт пикапнет).

## 9. Smoke test

```bash
# Открыть https://aihub-app.46-62-215-11.nip.io/login
# Залогиниться по magic-link (письмо придёт на ilia.paliy@icloud.com)
# Welcome bonus 100 токенов автоматически создан триггером

# Запустить text-to-image: должен залогиниться job, через ~10 sec появиться картинка в /gallery
# Запустить text-to-video: видео ~30-60 sec, потом в /gallery

# Открыть /admin/overview — должны быть метрики
# Открыть /admin/users — себя видно, role=admin
```

## 10. Мониторинг

- `docker compose logs -f` — JSON structured logs (logger.ts)
- `https://aihub-app.46-62-215-11.nip.io/api/health` — readiness probe (DB + Redis)
- Watchdog: каждую минуту сканирует stuck jobs, refundит после 15 min — лог `[watchdog]`
- Rate limit: 5 параллельных jobs на юзера → 429 если превышено

## Rollback plan

```bash
# Контейнеры
docker compose --env-file .env.production down

# БД (если миграции что-то сломали)
docker exec aisales-postgres psql -U aisales -c "DROP DATABASE ai_hub;"
# (есть бэкап в aisales-postgres-backups/ai_hub-*.dump.gz после шага 1c)

# Caddy
cp /etc/caddy/Caddyfile.bak.<timestamp> /etc/caddy/Caddyfile
systemctl reload caddy

# pg_backup
cp /home/aisales/scripts/pg_backup.sh.bak.20260519_093701 /home/aisales/scripts/pg_backup.sh
# удалить PG_DBS из backup.env
sed -i '/^PG_DBS=/d' /home/aisales/.config/aisales/backup.env
```

## Постдеплой gaps

1. **MinIO bucket backup** — `aux_backup.sh` не покрывает `ai-hub-media`. Когда там накопится контент, расширить `aux_backup.sh` через `mc mirror` или включить bucket replication.
2. **Sentry / error tracking** — пока только stdout JSON. Если нужно — добавить `@sentry/nextjs` в [src/lib/logger.ts](src/lib/logger.ts).
3. **Promo codes UI** — таблицы `promo_codes` + `promo_redemptions` есть, redeem endpoint и UI на /wallet ещё нет.
4. **RU-платежи (Telegram Stars)** — паттерн из `tma.46-62-215-11.nip.io` (`project_stars_billing.md` в memory). Дублирующий webhook на `/api/webhooks/stars`.
