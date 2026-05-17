#!/usr/bin/env bash
# Полный health check всей системы AI Sales одной командой.
#
# Запуск на сервере:
#   chmod +x health_check.sh
#   ./health_check.sh

set -uo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✕${NC} $1"; }

echo "════════════════════════════════════════"
echo "AI Sales · health check · $(date)"
echo "════════════════════════════════════════"

# ============ Docker containers ============
echo ""
echo "📦 DOCKER CONTAINERS"
echo "---"

EXPECTED=("aisales-postgres" "aisales-redis" "aisales-qdrant" "aisales-minio" "aisales-api-v2")
for c in "${EXPECTED[@]}"; do
    STATUS=$(docker inspect --format='{{.State.Status}}' "$c" 2>/dev/null || echo "missing")
    HEALTH=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$c" 2>/dev/null || echo "?")
    case "$STATUS" in
        running)
            if [[ "$HEALTH" == "healthy" || "$HEALTH" == "n/a" ]]; then
                ok "$c · running ($HEALTH)"
            else
                warn "$c · running but $HEALTH"
            fi
            ;;
        missing) fail "$c · CONTAINER MISSING" ;;
        *) fail "$c · $STATUS" ;;
    esac
done

# ============ API health ============
echo ""
echo "🌐 API ENDPOINTS"
echo "---"

API_HEALTH=$(curl -sf -m 5 http://localhost:8001/health 2>/dev/null || echo "")
if [[ "$API_HEALTH" == *"healthy"* ]]; then
    ok "/health · 200 OK"
else
    fail "/health · недоступен на :8001"
fi

READY=$(curl -sf -m 5 http://localhost:8001/ready 2>/dev/null || echo "")
if [[ "$READY" == *"ready"* ]]; then
    ok "/ready · готов"
    echo "  → $(echo "$READY" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(", ".join(f"{k}={v}" for k,v in d["checks"].items()))' 2>/dev/null || echo "$READY")"
else
    warn "/ready · degraded ($READY)"
fi

# ============ Disk + memory ============
echo ""
echo "💾 RESOURCES"
echo "---"

DISK_USED=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [[ $DISK_USED -lt 80 ]]; then
    ok "Disk: ${DISK_USED}% used"
else
    warn "Disk: ${DISK_USED}% used (приближается к лимиту)"
fi

MEM_FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
if [[ $MEM_FREE_MB -gt 500 ]]; then
    ok "Memory: ${MEM_FREE_MB}MB free"
else
    warn "Memory: только ${MEM_FREE_MB}MB free"
fi

LOAD=$(uptime | awk -F'load average:' '{print $2}' | tr -d ' ')
ok "Load: $LOAD"

# ============ Logs · последние ошибки ============
echo ""
echo "📋 RECENT API ERRORS (last 5 min)"
echo "---"

ERRORS=$(docker logs aisales-api-v2 --since 5m 2>&1 | grep -iE 'error|exception|traceback|✕' | tail -5)
if [[ -z "$ERRORS" ]]; then
    ok "Без ошибок"
else
    warn "Найдены ошибки:"
    echo "$ERRORS" | sed 's/^/  /'
fi

# ============ Anthropic API check ============
echo ""
echo "🤖 ANTHROPIC API"
echo "---"

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    AKEY_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        https://api.anthropic.com/v1/models)
    if [[ "$AKEY_TEST" == "200" ]]; then
        ok "API key валиден"
    else
        fail "API key возвращает HTTP $AKEY_TEST"
    fi
else
    warn "ANTHROPIC_API_KEY не установлен в env (но в .env контейнера может быть)"
fi

# ============ TG webhook (если зарегистрирован) ============
if [[ -n "${TG_BOT_TOKEN:-}" ]]; then
    echo ""
    echo "📱 TELEGRAM WEBHOOK"
    echo "---"
    WH=$(curl -sf "https://api.telegram.org/bot${TG_BOT_TOKEN}/getWebhookInfo")
    URL=$(echo "$WH" | python3 -c "import sys, json; print(json.load(sys.stdin)['result'].get('url', ''))" 2>/dev/null)
    if [[ -n "$URL" ]]; then
        ok "Webhook зарегистрирован: $URL"
        PENDING=$(echo "$WH" | python3 -c "import sys, json; print(json.load(sys.stdin)['result'].get('pending_update_count', 0))" 2>/dev/null)
        if [[ "$PENDING" -gt 0 ]]; then
            warn "Накопилось $PENDING необработанных сообщений"
        fi
    else
        warn "Webhook не зарегистрирован"
    fi
fi

# ============ Summary ============
echo ""
echo "════════════════════════════════════════"
echo "Health check завершён · $(date +%H:%M:%S)"
echo "════════════════════════════════════════"
