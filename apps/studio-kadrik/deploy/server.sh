#!/bin/bash
# Activate an uploaded release of @studio_kadrik_bot on the aicex box. Run as root by deploy-studio-kadrik.yml:
#   ssh root@host bash -s -- <release> [check] < deploy/server.sh
# With "check" it only compares the release with the live code (diff of every file) and changes nothing.
#
# The release is unpacked to /opt/studio-kadrik/releases/<release>. Only the code is copied into the live folder
# (KADRIK_DIR); everything the bot keeps there stays as is: .env, data/ (players, ledger, access), .review-venv,
# bot.log, .miniapp_url. The systemd unit studio-kadrik-bot, the Python env and ~/creator-pack-miniapp are not touched.
# Before the copy the current code is saved to /opt/studio-kadrik/backups/<release>.tgz; if the bot does not come back
# (service inactive or the mini-app port does not answer), that backup is restored and the run fails.
set -euo pipefail
REL="$1"
MODE="${2:-}"
DIR="${KADRIK_DIR:-/home/iliapaliy/studio-kadrik-bot}"
SVC="${KADRIK_SERVICE:-studio-kadrik-bot}"
ROOT=/opt/studio-kadrik
SRC="$ROOT/releases/$REL"
CODE=(bot.py heavy_slot.py review_tools.py start.sh requirements.txt requirements.lock public assets)

[ -d "$SRC" ] || { echo "no release $SRC"; exit 1; }
[ -f "$DIR/.env" ] || { echo "no $DIR/.env — the bot is not installed here, nothing to update"; exit 1; }
OWNER="$(stat -c %U "$DIR")"
PORT="$(sed -n 's/^MINIAPP_PORT=//p' "$DIR/.env" | tr -d '"'\'' ' | tail -1)"
PORT="${PORT:-8095}"

python3 -m py_compile "$SRC/bot.py" "$SRC/heavy_slot.py" "$SRC/review_tools.py"
rm -rf "$SRC/__pycache__"

if [ "$MODE" = check ]; then
  echo "check only: live $DIR vs release $REL"
  for f in "${CODE[@]}"; do diff -ru "$DIR/$f" "$SRC/$f" | head -400 || true; done
  exit 0
fi

mkdir -p "$ROOT/backups"
BAK="$ROOT/backups/$REL.tgz"
( cd "$DIR" && tar -czf "$BAK" --ignore-failed-read "${CODE[@]}" 2>/dev/null ) || true
echo "backup: $BAK"
echo "bot.py live → release: $( (diff -u "$DIR/bot.py" "$SRC/bot.py" || true) | grep -c '^[-+][^-+]' || true) changed lines"

install_code() {
  for f in "${CODE[@]}"; do
    [ -e "$1/$f" ] || continue
    rm -rf "${DIR:?}/$f"
    cp -a "$1/$f" "$DIR/$f"
    chown -R "$OWNER:$OWNER" "$DIR/$f"
  done
  chmod +x "$DIR/start.sh"
}

healthy() {
  sleep 15
  systemctl is-active --quiet "$SVC" || return 1
  for _ in 1 2 3 4 5 6; do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/")" = 200 ] && return 0
    sleep 5
  done
  return 1
}

install_code "$SRC"
systemctl restart "$SVC"
if healthy; then
  echo "studio-kadrik $REL is up"
  tail -5 "$DIR/bot.log" 2>/dev/null || true
else
  echo "::error::bot did not come back — restoring the previous code"
  journalctl -u "$SVC" -n 40 --no-pager || true
  tail -40 "$DIR/bot.log" 2>/dev/null || true
  OLD="$(mktemp -d)"
  tar -xzf "$BAK" -C "$OLD"
  install_code "$OLD"
  rm -rf "$OLD"
  systemctl restart "$SVC"
  exit 1
fi

# keep the last 7 releases and backups
ls -1dt "$ROOT"/releases/* | tail -n +8 | xargs -r rm -rf
ls -1t "$ROOT"/backups/*.tgz | tail -n +8 | xargs -r rm -f
