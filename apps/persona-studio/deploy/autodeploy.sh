#!/usr/bin/env bash
# Pull-based auto-deploy: if the tracked branch has a new commit, update the
# code and rebuild/restart the Persona Studio stack. Run by the systemd timer
# installed with install-autodeploy.sh (every 2 min). No inbound SSH needed —
# pushing to the branch is enough.
#
# Config (/etc/persona-autodeploy.env): BRANCH, INSTALL_DIR.
# Log: /var/log/persona-autodeploy.log
set -uo pipefail

BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/ai-command-center}"
DEPLOY="$INSTALL_DIR/apps/persona-studio/deploy"
LOCK=/run/persona-autodeploy.lock

exec 9>"$LOCK"
flock -n 9 || exit 0   # previous deploy still building

ts() { date -u +%FT%TZ; }
# Public, secret-free status for remote checks: https://<domain>/__status/version.txt
STATUS_DIR=/opt/edge/status
mkdir -p "$STATUS_DIR"
status() { printf '%s\n' "$@" > "$STATUS_DIR/version.txt.tmp" && mv "$STATUS_DIR/version.txt.tmp" "$STATUS_DIR/version.txt"; }
cd "$INSTALL_DIR" || exit 1

git fetch -q --depth 1 origin "$BRANCH" || { echo "$(ts) fetch failed"; exit 1; }
want="$(git rev-parse FETCH_HEAD)"
have="$(git rev-parse HEAD)"
force="${1:-}"
[ "$want" = "$have" ] && [ "$force" != "--force" ] && exit 0

echo "$(ts) deploying ${want:0:7} (was ${have:0:7}) from $BRANCH"
status "building ${want:0:7}" "since $(ts)" "running ${have:0:7}"
git reset -q --hard "$want"

cd "$DEPLOY" || exit 1
if docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --remove-orphans; then
  echo "$(ts) ✓ deployed ${want:0:7}: $(git log -1 --pretty=%s)"
  status "ok ${want:0:7}" "deployed $(ts)" "$(git log -1 --pretty=%s)"
  docker image prune -f >/dev/null 2>&1 || true
else
  echo "$(ts) ✗ build/start failed for ${want:0:7}"
  status "failed ${want:0:7}" "at $(ts)" "see /var/log/persona-autodeploy.log"
  exit 1
fi
