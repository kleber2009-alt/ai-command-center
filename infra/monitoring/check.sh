#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# infra/monitoring/check.sh
# ───────────────────────────────────────────────────────────────────
# Self-hosted healthcheck. Запускается cron'ом каждые N минут, дёргает
# /api/health, и если что-то упало — шлёт алёрт в Telegram через
# /api/notify-tg (если сам /api/notify-tg доступен).
#
# Дополнительно проверяет внешние SaaS — Telegram Bot API, ElevenLabs.
# Состояние пишется в /var/lib/aio-monitor/state — алёрты шлются
# только на ИЗМЕНЕНИЕ статуса (no spam при затяжном инциденте),
# плюс один напоминалкой раз в час.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

BASE_URL="${BASE_URL:-https://46.62.215.11.nip.io}"
STATE_DIR="${STATE_DIR:-/var/lib/aio-monitor}"
TG_NOTIFY_URL="${TG_NOTIFY_URL:-$BASE_URL/api/notify-tg}"
HOURLY_REMIND_AFTER_MIN="${HOURLY_REMIND_AFTER_MIN:-60}"

mkdir -p "$STATE_DIR"

notify() {
  local emoji="$1" message="$2"
  curl -fsS -X POST "$TG_NOTIFY_URL" \
    -H "Content-Type: application/json" \
    --max-time 10 \
    -d "$(printf '{"text":"%s %s"}' "$emoji" "$message")" >/dev/null 2>&1 || true
}

# Состояние: храним per-check «когда последний раз был OK / FAIL» + статус
# Простейший формат: $STATE_DIR/<check>.status (OK/FAIL) + .stamp (epoch при смене)
record_status() {
  local check="$1" status="$2" detail="${3:-}"
  local file="$STATE_DIR/$check.status"
  local stampfile="$STATE_DIR/$check.stamp"
  local prev=""
  [[ -f "$file" ]] && prev=$(cat "$file")
  echo "$status" > "$file"

  if [[ "$status" != "$prev" ]]; then
    # Сменился — алёрт
    date +%s > "$stampfile"
    if [[ "$status" == "FAIL" ]]; then
      notify "🔴" "*${check}* down — ${detail}"
    else
      notify "🟢" "*${check}* recovered"
    fi
  elif [[ "$status" == "FAIL" && -f "$stampfile" ]]; then
    # Затяжной FAIL — напомнить раз в час
    local now since
    now=$(date +%s)
    since=$(cat "$stampfile")
    local mins=$(( (now - since) / 60 ))
    if [[ $mins -gt 0 && $((mins % HOURLY_REMIND_AFTER_MIN)) -eq 0 ]]; then
      notify "🔴" "*${check}* still down (${mins} min) — ${detail}"
    fi
  fi
}

# ── 1. Backend /api/health ──
http_code=$(curl -fsS -o /tmp/aio-health -w '%{http_code}' --max-time 10 "$BASE_URL/api/health" 2>/dev/null || echo "000")
if [[ "$http_code" == "200" ]]; then
  record_status "backend" "OK"
else
  body=$(head -c 200 /tmp/aio-health 2>/dev/null || true)
  record_status "backend" "FAIL" "HTTP $http_code: $body"
fi

# ── 2. Transcribe app ──
http_code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE_URL/transcribe" 2>/dev/null || echo "000")
if [[ "$http_code" == "200" ]]; then
  record_status "transcribe" "OK"
else
  record_status "transcribe" "FAIL" "HTTP $http_code"
fi

# ── 3. ElevenLabs reachability ──
if [[ -n "${ELEVENLABS_API_KEY:-}" ]]; then
  http_code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "xi-api-key: $ELEVENLABS_API_KEY" \
    "https://api.elevenlabs.io/v1/user" 2>/dev/null || echo "000")
  if [[ "$http_code" == "200" ]]; then
    record_status "elevenlabs" "OK"
  else
    record_status "elevenlabs" "FAIL" "HTTP $http_code (билинг? rate limit?)"
  fi
fi

# ── 4. Telegram Bot API ──
if [[ -n "${TG_VOICE_BOT_TOKEN:-}" ]]; then
  http_code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 \
    "https://api.telegram.org/bot${TG_VOICE_BOT_TOKEN}/getMe" 2>/dev/null || echo "000")
  if [[ "$http_code" == "200" ]]; then
    record_status "tg_bot" "OK"
  else
    record_status "tg_bot" "FAIL" "HTTP $http_code (токен невалидный?)"
  fi
fi

# ── 5. Disk usage ──
disk_pct=$(df --output=pcent / 2>/dev/null | tail -1 | tr -d ' %' || echo "0")
if [[ "$disk_pct" -lt 85 ]]; then
  record_status "disk" "OK"
else
  record_status "disk" "FAIL" "Disk ${disk_pct}% full"
fi

exit 0
