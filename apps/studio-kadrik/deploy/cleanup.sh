#!/bin/bash
# Free disk space on the aicex box for @studio_kadrik_bot. Run as root by deploy-studio-kadrik.yml (mode "cleanup"):
#   ssh root@host bash -s -- [days] [recent|older] [keep|show|delete] < deploy/cleanup.sh
# and every 2 days by cleanup-studio-kadrik.yml with "2 older".
# Deletes montage job folders (sources and rendered videos) in JOBS_DIR: "recent" (default) — changed within the last
# <days> days (default 7), "older" — not changed for more than <days> days. A folder with anything changed inside in the last
# 30 minutes ("older": within <days>) is kept — a montage or an edit may be running there. Service entries of JOBS_DIR
# (_jobs.json, _img, _reviews, … — names starting with "_") stay. Also clears pip / yt-dlp / npm caches of the bot user
# and the sandbox, and old uploaded releases (the last 7 stay). Never touches .env, data/ (players, ledger) or backups.
# Third argument — the rest of ~/Movies of the bot user (not Kadrik's jobs; may belong to other bots): "show" lists it,
# "delete" removes everything there except Kadrik's jobs folder and entries changed in the last 30 minutes.
set -euo pipefail
DAYS="${1:-7}"
WHICH="${2:-recent}"
MOVIES="${3:-keep}"
case "$WHICH" in recent) AGE="-$DAYS" ;; older) AGE="+$((DAYS - 1))" ;; *) echo "recent or older, not $WHICH"; exit 1 ;; esac
DIR="${KADRIK_DIR:-/home/iliapaliy/studio-kadrik-bot}"
ROOT=/opt/studio-kadrik
[ -f "$DIR/.env" ] || { echo "no $DIR/.env — the bot is not installed here"; exit 1; }
OWNER="$(stat -c %U "$DIR")"
HOME_DIR="$(getent passwd "$OWNER" | cut -d: -f6)"
JOBS="$(sed -n 's/^JOBS_DIR=//p' "$DIR/.env" | tr -d '"'\''' | tail -1)"
JOBS="${JOBS:-$HOME_DIR/Movies/production-kadrik}"
JOBS="${JOBS/#\~/$HOME_DIR}"
SBX="$(sed -n 's/^SANDBOX_HOME=//p' "$DIR/.env" | tr -d '"'\''' | tail -1)"
SBX="${SBX:-$HOME_DIR/.kadrik-sandbox}"
SBX="${SBX/#\~/$HOME_DIR}"

echo "before:"; df -h / | tail -1
if [ -d "$JOBS" ]; then
  echo "jobs folder: $JOBS ($(du -sh "$JOBS" | cut -f1))"
  find "$JOBS" -mindepth 1 -maxdepth 1 -type d ! -name '_*' -mtime "$AGE" -print0 \
    | while IFS= read -r -d '' d; do
        # anything inside changed in the last 30 minutes (or, for "older", within <days>) — a montage or an edit is running
        recent="$( [ "$WHICH" = older ] && echo $((DAYS * 1440)) || echo 30 )"
        [ -n "$(find "$d" -mmin "-$recent" -print -quit)" ] && { echo "keep $d (in use)"; continue; }
        echo "rm $(du -sh "$d" | cut -f1) $d"; rm -rf "$d"
      done
  rm -rf "$JOBS/_reviews"/* 2>/dev/null || true
else
  echo "no jobs folder $JOBS"
fi
for c in "$HOME_DIR/.cache/pip" "$HOME_DIR/.cache/yt-dlp" "$HOME_DIR/.npm/_cacache" "$SBX/.cache" "$SBX/.npm/_cacache"; do
  [ -e "$c" ] && { echo "rm $(du -sh "$c" | cut -f1) $c"; rm -rf "$c"; }
done
MOV="$HOME_DIR/Movies"
if [ "$MOVIES" != keep ] && [ -d "$MOV" ]; then
  echo "other entries in $MOV:"
  find "$MOV" -mindepth 1 -maxdepth 1 ! -path "$JOBS" -print0 | while IFS= read -r -d '' e; do
    size="$(du -sh "$e" | cut -f1)"
    if [ "$MOVIES" = delete ]; then
      [ -n "$(find "$e" -mmin -30 -print -quit)" ] && { echo "keep $size $e (in use)"; continue; }
      echo "rm $size $e"; rm -rf "$e"
    else
      echo "  $size $e"; [ -d "$e" ] && du -sh "$e"/* 2>/dev/null | sort -h | tail -5 | sed 's/^/      /'
    fi
  done
fi
[ -d "$ROOT/releases" ] && ls -1dt "$ROOT"/releases/* 2>/dev/null | tail -n +8 | xargs -r rm -rf
echo "after:"; df -h / | tail -1
echo "largest folders in $HOME_DIR:"; du -xsh "$HOME_DIR"/* "$HOME_DIR"/.[!.]* 2>/dev/null | sort -h | tail -8
