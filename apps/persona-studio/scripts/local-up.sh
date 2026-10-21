#!/usr/bin/env bash
# One-command local run of Persona Studio (web + workers + infra).
#
#   bash apps/persona-studio/scripts/local-up.sh          # up (Ctrl-C stops web+worker)
#   bash apps/persona-studio/scripts/local-up.sh --down   # stop the docker infra
#
# What it does:
#   1. Starts Postgres / Redis / MinIO / Mailpit from docker-compose.dev.yml
#      (skip with SKIP_INFRA=1 if you run your own infra).
#   2. Writes .env for that infra if there is none (never overwrites yours).
#   3. Installs deps from the app's own package-lock.json in isolation, like the
#      prod Docker image does. The root workspace lockfile is incomplete, so a
#      plain `npm install` at the repo root leaves auth/S3 packages missing.
#   4. Applies migrations, then `db push` for models that have no migration yet.
#   5. Runs `npm run dev` (http://localhost:3020) and `npm run worker`.
#
# Written for macOS bash 3.2 and Linux: no bash-4 features, no GNU-only flags.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
COMPOSE=(docker compose -f docker-compose.dev.yml)

log() { printf '\033[1;33m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "--down" ]; then
  "${COMPOSE[@]}" down
  exit 0
fi

# ── 0. prerequisites ─────────────────────────────────────────
command -v node >/dev/null || die "Node.js не найден (нужен 20+)"
command -v npm >/dev/null || die "npm не найден"
command -v openssl >/dev/null || die "openssl не найден"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Нужен Node 20+, сейчас $(node -v)"

# ── 1. infra ─────────────────────────────────────────────────
if [ "${SKIP_INFRA:-0}" != "1" ]; then
  command -v docker >/dev/null || die "Docker не найден (запусти Docker Desktop или SKIP_INFRA=1)"
  docker info >/dev/null 2>&1 || die "Docker не запущен — открой Docker Desktop"
  log "Поднимаю Postgres / Redis / MinIO / Mailpit"
  "${COMPOSE[@]}" up -d
  log "Жду Postgres"
  i=0
  until "${COMPOSE[@]}" exec -T postgres pg_isready -U persona -d persona_studio >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -le 60 ] || die "Postgres не поднялся за 60 с (docker compose -f docker-compose.dev.yml logs postgres)"
    sleep 1
  done
fi

# ── 2. .env ──────────────────────────────────────────────────
if [ -f .env ]; then
  log ".env уже есть — оставляю как есть"
else
  log "Создаю .env под локальную инфраструктуру"
  cat > .env <<EOF
APP_URL=http://localhost:3020
DATABASE_URL=postgresql://persona:persona@localhost:5440/persona_studio?schema=public
REDIS_URL=redis://localhost:6390/3
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3020
EMAIL_SERVER_HOST=localhost
EMAIL_SERVER_PORT=1075
EMAIL_FROM=noreply@persona-studio.local
S3_ENDPOINT=http://localhost:9090
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=persona-studio-media
S3_PUBLIC_URL=http://localhost:9090/persona-studio-media
S3_FORCE_PATH_STYLE=true
# Вставь реальные ключи, чтобы работали генерации (они есть в прод .env):
KIE_API_KEY=placeholder
# HEYGEN_API_KEY=
# ELEVENLABS_API_KEY=
# ANTHROPIC_API_KEY=
EOF
fi

# ── 3. dependencies (isolated, from the app lockfile) ────────
if command -v shasum >/dev/null; then
  LOCK_HASH="$(shasum -a 256 package-lock.json | cut -d' ' -f1)"
else
  LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
fi
MARKER=node_modules/.local-up-lock-hash
if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$LOCK_HASH" ]; then
  log "Зависимости актуальны"
else
  log "Ставлю зависимости из package-lock.json приложения (изолированно)"
  TMP="$(mktemp -d)"
  cp package.json package-lock.json "$TMP/"
  (cd "$TMP" && npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund)
  rm -rf node_modules
  mv "$TMP/node_modules" ./node_modules
  rm -rf "$TMP" .next
  echo "$LOCK_HASH" > "$MARKER"
fi
npx prisma generate >/dev/null
log "Prisma client сгенерирован"

# ── 4. database ──────────────────────────────────────────────
log "Применяю миграции"
npx prisma migrate deploy
log "Досинхронизирую схему (модели без миграций)"
npx prisma db push --skip-generate

# ── 5. run ───────────────────────────────────────────────────
log "Запускаю сайт и воркеры (Ctrl-C — остановить)"
cat <<'EOF'

  Сайт:          http://localhost:3020
  Почта (вход):  http://localhost:8075   ← ссылка для входа приходит сюда
  MinIO консоль: http://localhost:9091   (minioadmin / minioadmin)

EOF
# Line-by-line prefixer in plain bash: awk variants (mawk) block-buffer input.
prefix() { while IFS= read -r line; do printf '%s %s\n' "$1" "$line"; done; }
trap 'trap - INT TERM EXIT; kill 0 2>/dev/null' INT TERM EXIT
npm run dev 2>&1 | prefix '[web]   ' &
npm run worker 2>&1 | prefix '[worker]' &
wait
