#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/diagnose.sh
# ───────────────────────────────────────────────────────────────────────
# Снимок состояния стека на сервере: что подняли, что упало, где логи.
#
# Использование:
#   ./scripts/diagnose.sh root@<IP>   # или ai@<IP>
#
# Вывод формируется так, чтобы его можно было кинуть мне в чат —
# сразу видно: какой контейнер не стартовал, какой healthcheck красный,
# где конкретная ошибка в логах.
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

TARGET="${1:-}"
[ -z "$TARGET" ] && { echo "Usage: $0 root@<IP>"; exit 1; }

STACK_DIR="${STACK_DIR:-/opt/ai-stack}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

ssh $SSH_OPTS "$TARGET" "bash -s '$STACK_DIR'" <<'REMOTE'
set -u
STACK_DIR="$1"
cd "$STACK_DIR" 2>/dev/null || { echo "✗ $STACK_DIR не существует"; exit 1; }

hr() { printf '\n══════ %s ══════\n' "$1"; }

hr "host"
echo "uname:   $(uname -a)"
echo "uptime:  $(uptime | tr -s ' ')"
echo "disk:    $(df -h / | tail -1)"
echo "mem:     $(free -h | grep Mem | tr -s ' ')"
docker --version 2>/dev/null || echo "docker: ✗ не установлен"
docker compose version 2>/dev/null | head -1 || echo "compose: ✗ не установлен"

hr "git"
git log --oneline -3 2>/dev/null || echo "✗ git repo не найден"
git status --short 2>/dev/null | head -10 || true
echo "branch: $(git branch --show-current 2>/dev/null || echo —)"

hr ".env"
if [ -f .env ]; then
  echo "exists, $(wc -l < .env) lines"
  # Не светим значения — только список заполненных ключей.
  grep -E '^[A-Z_]+=' .env | awk -F= '{ if ($2 != "" && $2 != "\"\"") print $1 "=*** (set)"; else print $1 "= (empty)" }'
else
  echo "✗ .env отсутствует"
fi

hr "docker compose ps"
docker compose ps 2>&1 || echo "✗ compose не работает"

hr "docker compose status (healthchecks)"
for c in ai-postgres ai-office ai-transcribe ai-ytdlp ai-nginx; do
  STATE=$(docker inspect -f '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$c" 2>/dev/null || echo "—")
  printf "  %-15s %s\n" "$c:" "$STATE"
done

hr "ports"
ss -tlnp 2>/dev/null | grep -E ':(80|443|3000|3001|5432|8080) ' | head -15 || echo "(нет ss)"

hr "healthz endpoints"
for p in 80 8080 3000; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/healthz" || echo ERR)
  printf "  :%-5d /healthz → %s\n" "$p" "$CODE"
done
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/transcribe || echo ERR)
printf "  :80    /transcribe → %s\n" "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/api/tasks || echo ERR)
printf "  :80    /api/tasks → %s\n" "$CODE"

hr "compose logs --tail=50 (each service)"
for s in postgres ai-office transcribe ytdlp nginx; do
  echo "─── $s ───"
  docker compose logs --tail=20 --no-color --no-log-prefix "$s" 2>&1 | sed 's/^/  /' | tail -25
done

hr "volumes"
docker volume ls --filter name=ai- 2>/dev/null | head -10

hr "postgres tables (если жив)"
if docker compose ps postgres 2>/dev/null | grep -q running; then
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-ai}" -d "${POSTGRES_DB:-ai}" -tAc "
    select 'transcripts: ' || count(*) from transcripts union all
    select 'tasks: '       || count(*) from tasks union all
    select 'me_documents:' || count(*) from me_documents union all
    select 'voices: '      || count(*) from voices;
  " 2>&1 | head -10
else
  echo "(postgres не running)"
fi

hr "конец отчёта"
REMOTE
