#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# scripts/cleanup-zombies.sh
# ───────────────────────────────────────────────────────────────────────
# Снимает старый, мёртвый compose-проект ai-command-center (контейнеры
# с префиксом ai-command-center-*) и опционально удаляет его volumes.
#
# Что прибивается:
#   · ai-command-center-caddy-1         (статус Created, никогда не стартовал)
#   · ai-command-center-transcribe-1    (старый Next.js 21h Up)
#   · ai-command-center-ai-office-1     (старый ai-office 21h Up)
#   · ai-command-center-postgres-1      (старый postgres 21h Up)
#   · ai-command-center-ytdlp-1         (старый ytdlp 21h Up)
#   · sleepy_brown                       (exited hello-world)
#
# Что НЕ трогается:
#   · infra-*           (текущий рабочий стек)
#   · aisales-*         (производственный API)
#   · aisales-api-v2    (v2)
#
# Volumes:
#   · ai-command-center_caddy_config   ─┐
#   · ai-command-center_caddy_data     ─┼ удаляются по флагу --rm-volumes
#   · ai-command-center_postgres_data  ─┘
#
# Использование:
#   ./scripts/cleanup-zombies.sh           # dry-run, только покажет что снесёт
#   ./scripts/cleanup-zombies.sh --yes     # сносит контейнеры
#   ./scripts/cleanup-zombies.sh --yes --rm-volumes  # + удаляет volumes
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

CONFIRM=0
RM_VOLUMES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) CONFIRM=1 ;;
    --rm-volumes) RM_VOLUMES=1 ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

ZOMBIE_CONTAINERS=(
  ai-command-center-caddy-1
  ai-command-center-transcribe-1
  ai-command-center-ai-office-1
  ai-command-center-postgres-1
  ai-command-center-ytdlp-1
  sleepy_brown
)

ZOMBIE_VOLUMES=(
  ai-command-center_caddy_config
  ai-command-center_caddy_data
  ai-command-center_postgres_data
)

echo "═══ Контейнеры на удаление ═══"
for c in "${ZOMBIE_CONTAINERS[@]}"; do
  if docker inspect "$c" >/dev/null 2>&1; then
    STATUS=$(docker inspect -f '{{.State.Status}}' "$c")
    UPTIME=$(docker inspect -f '{{.State.StartedAt}}' "$c")
    echo "  $c — $STATUS — started $UPTIME"
  else
    echo "  $c — НЕ СУЩЕСТВУЕТ (ок, пропущу)"
  fi
done

echo ""
echo "═══ Volumes на удаление ═══"
for v in "${ZOMBIE_VOLUMES[@]}"; do
  if docker volume inspect "$v" >/dev/null 2>&1; then
    SIZE=$(docker run --rm -v "$v:/v" alpine du -sh /v 2>/dev/null | cut -f1 || echo '?')
    echo "  $v (~$SIZE)"
  else
    echo "  $v — НЕ СУЩЕСТВУЕТ"
  fi
done

if [ "$CONFIRM" = "0" ]; then
  echo ""
  echo "Это dry-run. Чтобы реально снести:"
  echo "  ./scripts/cleanup-zombies.sh --yes              # только контейнеры"
  echo "  ./scripts/cleanup-zombies.sh --yes --rm-volumes # + volumes"
  exit 0
fi

echo ""
echo "→ Удаляю контейнеры"
for c in "${ZOMBIE_CONTAINERS[@]}"; do
  docker rm -f "$c" >/dev/null 2>&1 && echo "  ✓ $c" || echo "  — $c (не было)"
done

if [ "$RM_VOLUMES" = "1" ]; then
  echo ""
  echo "→ Удаляю volumes"
  for v in "${ZOMBIE_VOLUMES[@]}"; do
    docker volume rm "$v" >/dev/null 2>&1 && echo "  ✓ $v" || echo "  — $v"
  done
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "✓ Готово. Текущее состояние:"
echo ""
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo "═══════════════════════════════════════════════════════════════════"
