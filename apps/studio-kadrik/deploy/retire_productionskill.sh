#!/bin/bash
# Retire @Productionskill_bot (Creator Pack) on the aicex box: everything Kadrik still takes from it moves into the Kadrik
# folder, then the old bot is stopped and its files are deleted to free disk space. Run as root by deploy-studio-kadrik.yml:
#   ssh root@host bash -s -- [inspect|apply] < deploy/retire_productionskill.sh
# "inspect" (default) changes nothing: it finds the old bot (systemd units, folder, jobs, catalog) and prints what Kadrik
# still uses from it and what "apply" would delete, with sizes.
# "apply":
#   1. copies the style catalog (~/creator-pack-miniapp/public: skills.json, samples/, img/) into $KADRIK_DIR/pack/public
#      and writes PACK_DIR into Kadrik's .env;
#   2. replaces skills in ~/.claude/skills that are symlinks into the folders being deleted with real copies;
#   3. gives Kadrik its own Python env ($KADRIK_DIR/venv from requirements.lock) and a systemd drop-in that starts it via
#      start.sh with that env (before, the unit ran on the old bot's env);
#   4. restarts Kadrik and checks the mini-app port and the catalog; if anything fails, the drop-in and .env are restored
#      and nothing is deleted;
#   5. stops and disables the old bot's units, saves its .env, data and small files (no videos, envs, node_modules) to
#      /opt/studio-kadrik/backups/productionskill-<time>.tgz, deletes the unit files, its folder, its jobs folder and
#      ~/creator-pack-miniapp.
# Overrides: PS_DIR (old bot folder), PS_UNITS (space-separated unit names), KADRIK_DIR, KADRIK_SERVICE.
set -euo pipefail
MODE="${1:-inspect}"
case "$MODE" in inspect|apply) ;; *) echo "inspect or apply, not $MODE"; exit 1 ;; esac
DIR="${KADRIK_DIR:-/home/iliapaliy/studio-kadrik-bot}"
SVC="${KADRIK_SERVICE:-studio-kadrik-bot}"
ROOT=/opt/studio-kadrik
TS="$(date -u +%Y%m%d%H%M%S)"
[ -f "$DIR/.env" ] || { echo "no $DIR/.env — Kadrik is not installed here"; exit 1; }
OWNER="$(stat -c %U "$DIR")"
HOME_DIR="$(getent passwd "$OWNER" | cut -d: -f6)"
PORT="$(sed -n 's/^MINIAPP_PORT=//p' "$DIR/.env" | tr -d '"'\'' ' | tail -1)"; PORT="${PORT:-8095}"
envval() { sed -n "s/^$1=//p" "$2" 2>/dev/null | tr -d '"'\''' | tail -1; }
abs() { [ -n "$1" ] || return 0; local p="${1/#\~/$HOME_DIR}"; readlink -m "$p"; }
size() { [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "-"; }
inside() { case "$(readlink -m "$1")/" in "$(readlink -m "$2")"/*) return 0 ;; *) return 1 ;; esac; }

# --- find the old bot: units whose name or ExecStart/WorkingDirectory mention productionskill ---
UNITS="${PS_UNITS:-}"
if [ -z "$UNITS" ]; then
  for f in /etc/systemd/system/*.service; do
    [ -f "$f" ] || continue
    u="$(basename "$f")"
    [ "$u" = "$SVC.service" ] && continue
    if echo "$u" | grep -qi 'productionskill\|production-skill\|creator-pack' \
       || grep -qiE '^(ExecStart|WorkingDirectory)=.*(productionskill|production-skill|creator-pack)' "$f"; then
      UNITS="$UNITS $u"
    fi
  done
fi
UNITS="$(echo $UNITS)"
PS="${PS_DIR:-}"
if [ -z "$PS" ]; then
  for u in $UNITS; do
    w="$(systemctl show -p WorkingDirectory --value "$u" 2>/dev/null || true)"
    [ -n "$w" ] && [ "$w" != / ] && { PS="$w"; break; }
  done
fi
[ -z "$PS" ] && for c in "$HOME_DIR/productionskill-bot" "$HOME_DIR/productionskill_bot" "$HOME_DIR/production-skill-bot"; do
  [ -d "$c" ] && { PS="$c"; break; }
done
PACKSRC="$(abs "$(envval PACK_DIR "$DIR/.env")")"
[ "$PACKSRC" = "$(readlink -m "$DIR/pack")" ] && PACKSRC="$HOME_DIR/creator-pack-miniapp"  # already moved: delete the old copy
[ -n "$(envval PACK_DIR "$DIR/.env")" ] || PACKSRC="$HOME_DIR/creator-pack-miniapp"
PSJOBS=""
[ -n "$PS" ] && [ -f "$PS/.env" ] && { j="$(envval JOBS_DIR "$PS/.env")"; [ -n "$j" ] && PSJOBS="$(abs "$j")"; }
KJOBS="$(abs "$(envval JOBS_DIR "$DIR/.env")")"; [ -n "$(envval JOBS_DIR "$DIR/.env")" ] || KJOBS="$HOME_DIR/Movies/production-kadrik"
KSBX="$(abs "$(envval SANDBOX_HOME "$DIR/.env")")"; [ -n "$(envval SANDBOX_HOME "$DIR/.env")" ] || KSBX="$HOME_DIR/.kadrik-sandbox"

echo "== Kadrik: $DIR (user $OWNER, service $SVC, port $PORT)"
echo "   ExecStart: $(systemctl show -p ExecStart --value "$SVC" | sed 's/ ; .*//' | head -1)"
echo "   Environment: $(systemctl show -p Environment --value "$SVC")"
echo "   jobs: $KJOBS ($(size "$KJOBS")) · catalog now: $PACKSRC"
echo "== old bot units: ${UNITS:-none found}"
for u in $UNITS; do echo "   $u: $(systemctl is-active "$u" 2>/dev/null || true), $(systemctl is-enabled "$u" 2>/dev/null || true) · $(systemctl show -p ExecStart --value "$u" | sed 's/ ; .*//' | head -1)"; done
echo "== old bot folder: ${PS:-not found} ($( [ -n "$PS" ] && size "$PS" || echo -))"
echo "   its jobs: ${PSJOBS:-none in its .env} ($( [ -n "$PSJOBS" ] && size "$PSJOBS" || echo -))"
echo "== catalog: $PACKSRC ($(size "$PACKSRC")) · skills.json: $( [ -f "$PACKSRC/public/skills.json" ] && python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["skills"]))' "$PACKSRC/public/skills.json" || echo missing)"

# --- what still points into the folders to delete ---
DEL=()
[ -n "$PS" ] && [ -d "$PS" ] && DEL+=("$PS")
[ -n "$PSJOBS" ] && [ -d "$PSJOBS" ] && DEL+=("$PSJOBS")
[ -d "$PACKSRC" ] && DEL+=("$PACKSRC")
BLOCK=0
for d in "${DEL[@]}"; do
  for keep in "$DIR" "$KJOBS" "$KSBX" "$HOME_DIR" "$HOME_DIR/.claude"; do
    if [ "$(readlink -m "$d")" = "$(readlink -m "$keep")" ] || inside "$keep" "$d"; then
      echo "::error::$d holds $keep that Kadrik needs — set PS_DIR / move it first"; BLOCK=1
    fi
  done
done
LINKS=()
for l in "$HOME_DIR"/.claude/skills/*; do
  [ -L "$l" ] || continue
  t="$(readlink -f "$l" || true)"
  for d in "${DEL[@]}"; do inside "$t" "$d" && { LINKS+=("$l"); echo "   skill symlink into a deleted folder: $l → $t"; }; done
done
OTHERS=""
if [ "${#DEL[@]}" -gt 0 ]; then
  RE="$(printf '%s|' "${DEL[@]}" | sed 's/|$//')"
  for f in /etc/systemd/system/*.service /etc/systemd/system/*.d/*.conf; do
    [ -f "$f" ] && grep -qsE "$RE" "$f" || continue
    case " $UNITS " in *" $(basename "$f") "*) continue ;; esac
    case "$f" in /etc/systemd/system/$SVC.service) ;; *) OTHERS="$OTHERS $f" ;; esac
  done
  # in Kadrik's own unit only ExecStart / PY may point there — the drop-in replaces them
  KU="$(grep -sE "$RE" "/etc/systemd/system/$SVC.service" | grep -vE '^(ExecStart|Environment="?PY=)' || true)"
  [ -n "$KU" ] && OTHERS="$OTHERS $SVC.service: $KU"
fi
[ -n "$OTHERS" ] && { echo "::error::these still use the folders to delete:$OTHERS"; BLOCK=1; }
CRON="$(crontab -l -u "$OWNER" 2>/dev/null | grep -iE 'productionskill|production-skill|creator-pack' || true)"
[ -n "$CRON" ] && echo "   cron of $OWNER mentions the old bot (removed on apply):" && echo "$CRON" | sed 's/^/     /'
CF="$(grep -rlis 'productionskill\|creator-pack' "$HOME_DIR/.cloudflared" /etc/cloudflared 2>/dev/null || true)"
[ -n "$CF" ] && echo "   cloudflared configs mention it (not changed, check by hand): $CF"
echo "== apply would delete: ${DEL[*]:-nothing} and units: ${UNITS:-none}"
echo "disk:"; df -h / | tail -1

if [ "$MODE" = inspect ]; then exit 0; fi
[ "$BLOCK" = 0 ] || exit 1
[ -n "$UNITS$PS" ] || [ -d "$PACKSRC" ] || { echo "nothing left of the old bot"; exit 0; }

# --- 1. catalog into Kadrik ---
if [ -f "$PACKSRC/public/skills.json" ]; then
  mkdir -p "$DIR/pack"
  rm -rf "$DIR/pack/public.new"; cp -a "$PACKSRC/public" "$DIR/pack/public.new"
  rm -rf "$DIR/pack/public"; mv "$DIR/pack/public.new" "$DIR/pack/public"
  chown -R "$OWNER:$OWNER" "$DIR/pack"
  echo "catalog → $DIR/pack/public ($(size "$DIR/pack"))"
fi
[ -f "$DIR/pack/public/skills.json" ] || { echo "::error::no catalog in $DIR/pack — not deleting anything"; exit 1; }
N="$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["skills"]))' "$DIR/pack/public/skills.json")"

# --- 2. skills that are symlinks into deleted folders become real copies ---
for l in "${LINKS[@]}"; do
  t="$(readlink -f "$l")"; rm -f "$l"; cp -a "$t" "$l"; chown -R "$OWNER:$OWNER" "$l"; echo "skill copied: $l"
done

# --- 3. own Python env + drop-in ---
mkdir -p "$ROOT/backups"; cp -a "$DIR/.env" "$ROOT/backups/retire-$TS.env"
chmod 600 "$ROOT/backups/retire-$TS.env"
if [ ! -x "$DIR/venv/bin/python" ]; then
  sudo -u "$OWNER" -H python3 -m venv "$DIR/venv" 2>/dev/null \
    || { rm -rf "$DIR/venv"; apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv; sudo -u "$OWNER" -H python3 -m venv "$DIR/venv"; }
fi
REQ="$DIR/requirements.lock"; [ -f "$REQ" ] || REQ="$DIR/requirements.txt"
sudo -u "$OWNER" -H "$DIR/venv/bin/pip" install -q -r "$REQ"
sudo -u "$OWNER" -H "$DIR/venv/bin/python" -c 'import aiogram, aiohttp, dotenv' || { echo "::error::venv is broken"; exit 1; }
grep -v '^PACK_DIR=' "$DIR/.env" > "$DIR/.env.tmp" || true
[ -z "$(tail -c1 "$DIR/.env.tmp")" ] || echo >> "$DIR/.env.tmp"
echo "PACK_DIR=$DIR/pack" >> "$DIR/.env.tmp"
cat "$DIR/.env.tmp" > "$DIR/.env" && rm -f "$DIR/.env.tmp"
DROP="/etc/systemd/system/$SVC.service.d/own-env.conf"
mkdir -p "$(dirname "$DROP")"
printf '[Service]\nWorkingDirectory=%s\nEnvironment=PY=%s/venv/bin/python\nExecStart=\nExecStart=%s/start.sh\n' "$DIR" "$DIR" "$DIR" > "$DROP"
systemctl daemon-reload
systemctl restart "$SVC"

# --- 4. health: service up, port answers, catalog served ---
ok=0; sleep 15
if systemctl is-active --quiet "$SVC"; then
  for _ in 1 2 3 4 5 6; do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/")" = 200 ] && { ok=1; break; }
    sleep 5
  done
fi
[ "$ok" = 1 ] && [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/pack/skills.json")" != 200 ] && { echo "catalog is not served from $DIR/pack"; ok=0; }
if [ "$ok" != 1 ]; then
  echo "::error::Kadrik did not come back on its own env — restoring, nothing deleted"
  journalctl -u "$SVC" -n 30 --no-pager || true; tail -30 "$DIR/bot.log" 2>/dev/null || true
  rm -f "$DROP"; cat "$ROOT/backups/retire-$TS.env" > "$DIR/.env"
  systemctl daemon-reload; systemctl restart "$SVC"
  exit 1
fi
echo "Kadrik is up on $DIR/venv · catalog: $N styles"
tail -3 "$DIR/bot.log" 2>/dev/null || true

# --- 5. retire the old bot ---
for u in $UNITS; do systemctl disable --now "$u" 2>/dev/null || true; echo "stopped $u"; done
if [ -n "$PS" ] && [ -d "$PS" ]; then
  tar -czf "$ROOT/backups/productionskill-$TS.tgz" -C "$(dirname "$PS")" \
    --exclude='venv' --exclude='.venv' --exclude='node_modules' --exclude='__pycache__' --exclude='*.mp4' --exclude='*.mov' \
    --exclude='*.m4a' --exclude='*.wav' --exclude='*.mp3' --exclude='*.webm' --exclude='*.mkv' --exclude='*.zip' \
    "$(basename "$PS")" 2>/dev/null || true
  chmod 600 "$ROOT/backups/productionskill-$TS.tgz"
  echo "backup of the old bot (code, .env, data): $ROOT/backups/productionskill-$TS.tgz ($(size "$ROOT/backups/productionskill-$TS.tgz"))"
fi
for u in $UNITS; do rm -f "/etc/systemd/system/$u"; rm -rf "/etc/systemd/system/$u.d"; done
systemctl daemon-reload; systemctl reset-failed 2>/dev/null || true
if [ -n "$CRON" ]; then
  crontab -l -u "$OWNER" | grep -viE 'productionskill|production-skill|creator-pack' | crontab -u "$OWNER" -
  echo "cron lines removed"
fi
for d in "${DEL[@]}"; do echo "rm $(size "$d") $d"; rm -rf "$d"; done
echo "after:"; df -h / | tail -1
echo "done. Left: delete the bot itself in @BotFather (/deletebot → @Productionskill_bot)."
