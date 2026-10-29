#!/bin/bash
# Free disk space on the aicex box for @studio_kadrik_bot. Run as root by deploy-studio-kadrik.yml (mode "cleanup"):
#   ssh root@host bash -s -- [days] [recent|older] [keep|show|delete] < deploy/cleanup.sh
# and every 2 days by cleanup-studio-kadrik.yml with "2 older".
# Deletes montage job folders (sources and rendered videos) in JOBS_DIR: "recent" (default) — changed within the last
# <days> days (default 7), "older" — not changed for more than <days> days. A folder with anything changed inside in the last
# 30 minutes ("older": within <days>) is kept — a montage or an edit may be running there. Service entries of JOBS_DIR
# (_jobs.json, _img, _reviews, … — names starting with "_") stay. Also clears pip / yt-dlp / npm caches of the bot user
# and the sandbox, and old uploaded releases (the last 7 stay). Never touches .env, data/ (players, ledger) or backups.
# The same age rule applies to dated job folders (YYYYMMDD-…) of other montage bots: ~/Movies/production, ~/Movies/montazh/bot.
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
# prune <folder> <name glob>: delete job folders matching the glob by age (WHICH/DAYS); "_*" service entries stay
prune() {
  local root="$1" glob="$2" recent d
  [ -d "$root" ] || { echo "no jobs folder $root"; return 0; }
  echo "jobs folder: $root ($(du -sh "$root" | cut -f1))"
  # anything inside changed in the last 30 minutes (or, for "older", within <days>) — a montage or an edit is running
  recent="$( [ "$WHICH" = older ] && echo $((DAYS * 1440)) || echo 30 )"
  find "$root" -mindepth 1 -maxdepth 1 -type d -name "$glob" ! -name '_*' -mtime "$AGE" -print0 \
    | while IFS= read -r -d '' d; do
        [ -n "$(find "$d" -mmin "-$recent" -print -quit)" ] && { echo "keep $d (in use)"; continue; }
        echo "rm $(du -sh "$d" | cut -f1) $d"; rm -rf "$d"
      done
}
prune "$JOBS" '*'
rm -rf "$JOBS/_reviews"/* 2>/dev/null || true
# job folders of other montage bots in ~/Movies (same layout: YYYYMMDD-HHMM-xxxx + "_*" service entries);
# only dated folders are touched, everything else there (references, code) stays
for other in "$HOME_DIR/Movies/production" "$HOME_DIR/Movies/montazh/bot"; do
  [ "$other" = "$JOBS" ] || prune "$other" '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-*'
done
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
      echo "  $size $e"; [ -d "$e" ] && { du -sh "$e"/* 2>/dev/null | sort -h | tail -5 | sed 's/^/      /' || true; }
    fi
  done
fi
[ -d "$ROOT/releases" ] && ls -1dt "$ROOT"/releases/* 2>/dev/null | tail -n +8 | xargs -r rm -rf
echo "after:"; df -h / | tail -1
echo "largest folders in $HOME_DIR:"; du -xsh "$HOME_DIR"/* "$HOME_DIR"/.[!.]* 2>/dev/null | sort -h | tail -8 || true
