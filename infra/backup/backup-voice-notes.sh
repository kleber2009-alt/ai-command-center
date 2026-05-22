#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# infra/backup/backup-voice-notes.sh
# ───────────────────────────────────────────────────────────────────
# Hourly sync of generated voice-notes volume → S3.
# Voice files are write-once-never-modified, so rclone sync только
# догружает новые. Старые остаются как есть (можно настроить
# lifecycle policy на bucket для древнего архивирования).
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

CONTAINER="${AI_OFFICE_CONTAINER:-infra-ai-office-1}"
VOLUME_PATH_IN_CONTAINER="${VOLUME_PATH:-/data/voice-notes}"
REMOTE="${RCLONE_REMOTE:-s3}"
BUCKET="${BACKUP_BUCKET:-aio-backups}"
PREFIX="${VOICE_PREFIX:-aio/voice-notes}"

TG_NOTIFY_URL="${TG_NOTIFY_URL:-https://46.62.215.11.nip.io/api/notify-tg}"

# Получаем путь к volume на хосте
mount_path=$(docker inspect -f \
  '{{ range .Mounts }}{{ if eq .Destination "'"$VOLUME_PATH_IN_CONTAINER"'" }}{{ .Source }}{{ end }}{{ end }}' \
  "$CONTAINER" 2>/dev/null || true)

if [[ -z "$mount_path" ]] || [[ ! -d "$mount_path" ]]; then
  echo "[backup-vn] no mount or path not found: '$mount_path'"
  exit 1
fi

echo "[backup-vn] $(date -u +%FT%TZ) syncing $mount_path → ${REMOTE}:${BUCKET}/${PREFIX}/"

if ! rclone sync "$mount_path" "${REMOTE}:${BUCKET}/${PREFIX}" \
      --transfers 4 --checkers 8 --quiet; then
  curl -fsS -X POST "$TG_NOTIFY_URL" \
    -H "Content-Type: application/json" \
    -d '{"text":"❌ *Бэкап voice-notes упал:* rclone sync failed"}' || true
  exit 2
fi

echo "[backup-vn] done"
