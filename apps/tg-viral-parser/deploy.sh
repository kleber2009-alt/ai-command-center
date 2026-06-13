#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# deploy.sh — единый деплой tg-viral-parser (парсер + review-бот) через Docker.
#
# Запуск из терминала VS Code:
#     cd apps/tg-viral-parser
#     bash deploy.sh
#
# Скрипт идемпотентный — можно запускать повторно. Делает по шагам:
#   1. проверяет Docker
#   2. создаёт .env из шаблона (если нет) и просит заполнить
#   3. проверяет обязательные переменные
#   4. собирает образ
#   5. (если нет TG_SESSION_STRING) — интерактивный login, печатает строку для .env
#   6. создаёт таблицу parsed_posts (init-db)
#   7. прогоняет парсер (наполняет БД)
#   8. поднимает review-бот (long-running)
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# выбрать «docker compose» (v2) или «docker-compose» (v1)
if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else die "Docker Compose не найден. Установи Docker Desktop и запусти его."; fi

# ── 1. Docker запущен? ───────────────────────────────────────────────────────
bold "[1/8] Проверяю Docker…"
docker info >/dev/null 2>&1 || die "Docker-демон не запущен. Открой Docker Desktop и дождись 'Engine running', затем повтори."
ok "Docker работает ($DC)"

# ── 2. .env ──────────────────────────────────────────────────────────────────
bold "[2/8] Проверяю .env…"
if [[ ! -f .env ]]; then
  cp .env.example .env
  warn ".env создан из шаблона. Заполни его (в VS Code открой apps/tg-viral-parser/.env) и запусти deploy.sh снова."
  warn "Минимум: TELEGRAM_BOT_TOKEN, OWNER_TELEGRAM_ID, PUBLISH_CHANNEL, DATABASE_URL, TG_API_ID, TG_API_HASH, COMPETITOR_CHANNELS."
  exit 0
fi
set -a; . ./.env; set +a
ok ".env найден"

# ── 3. обязательные переменные ───────────────────────────────────────────────
bold "[3/8] Проверяю обязательные переменные…"
missing=()
for v in TELEGRAM_BOT_TOKEN OWNER_TELEGRAM_ID PUBLISH_CHANNEL DATABASE_URL TG_API_ID TG_API_HASH COMPETITOR_CHANNELS; do
  [[ -n "${!v:-}" ]] || missing+=("$v")
done
if (( ${#missing[@]} )); then
  die "Не заполнены в .env: ${missing[*]}"
fi
ok "Все обязательные переменные на месте"

# ── 4. сборка образа ─────────────────────────────────────────────────────────
bold "[4/8] Собираю Docker-образ…"
$DC build
ok "Образ собран"

# ── 5. session string для парсера (один раз, интерактивно) ───────────────────
bold "[5/8] Проверяю TG_SESSION_STRING…"
if [[ -z "${TG_SESSION_STRING:-}" ]]; then
  warn "TG_SESSION_STRING пуст — запускаю интерактивный login (введи номер ОТДЕЛЬНОГО аккаунта и код из Telegram)."
  $DC run --rm tg-viral-parser tg_viral_parser.py login
  warn "Скопируй строку выше в .env как TG_SESSION_STRING= и запусти deploy.sh снова."
  exit 0
fi
ok "Session string задан"

# ── 6. таблица parsed_posts ──────────────────────────────────────────────────
bold "[6/8] Создаю таблицу parsed_posts (init-db)…"
$DC run --rm tg-viral-parser tg_viral_parser.py init-db
ok "БД готова"

# ── 7. прогон парсера ────────────────────────────────────────────────────────
bold "[7/8] Прогоняю парсер (парсинг + скоринг + сохранение)…"
$DC run --rm tg-viral-parser
ok "Парсер отработал"

# ── 8. review-бот ────────────────────────────────────────────────────────────
bold "[8/8] Поднимаю review-бот…"
$DC up -d tg-viral-review-bot
ok "review-бот запущен"

echo
bold "Готово. Дальше:"
echo "  • В Telegram владельцу (@-бот): /start → /review"
echo "  • Логи бота:   $DC logs -f tg-viral-review-bot"
echo "  • Повторный парсинг: $DC run --rm tg-viral-parser"
echo "  • Остановить бот:    $DC down"
