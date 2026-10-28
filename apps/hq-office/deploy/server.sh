#!/usr/bin/env bash
# Activate an uploaded release of the living office on the aicex box (vars.HETZNER_HOST).
# Run by .github/workflows/deploy-hq-office.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/hq-office/releases/<release>/   uploaded files
#          /opt/hq-office/current → releases/<release>   switched atomically
#          /opt/hq-office/assistant/releases/<release>/, assistant/current   assistant server
#          /opt/hq-office/assistant.env (secrets, written by the workflow), assistant-data/ (history, memory, desk)
#          /opt/hq-office/runner/releases/<release>/   runner of the working desk → ~<bots' user>/hq-runner
#          /opt/hq-office/desk-runner.token, desk.env   shared secret of the desk and its runner (made here)
# A tiny static container (aicex-hq-office, caddy file-server) on the shared `edge` network
# serves /opt/hq-office/current; the personal assistant (aicex-hq-assistant, node) answers
# /api/assistant/* (also the working desk, /api/assistant/desk/*); the desk's runner is a systemd
# service under the bots' user (Claude Code with their login and skills). The edge Caddy gets its own site file /opt/edge/sites/hq-office.caddy
# (validate → reload, restore on failure).
set -euo pipefail
DOMAIN="${1:?usage: server.sh <domain> <release>}"
REL="${2:?usage: server.sh <domain> <release>}"
ROOT=/opt/hq-office
NAME=aicex-hq-office
ANAME=aicex-hq-assistant
SITE=/opt/edge/sites/hq-office.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"

[ -f "$ROOT/releases/$REL/index.html" ] || { echo "✗ release $REL not uploaded"; exit 1; }
ln -sfn "releases/$REL" "$ROOT/current.tmp" && mv -Tf "$ROOT/current.tmp" "$ROOT/current"
ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
echo "✓ current → $REL"

docker network inspect edge >/dev/null
if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped --network edge --memory 64m \
    -v "$ROOT":/srv:ro caddy:2.8-alpine caddy file-server --root /srv/current --listen :8080 >/dev/null
  echo "✓ started $NAME"
fi
for i in $(seq 1 15); do
  if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$NAME:8080/tasks.js" 2>/dev/null; then
    echo "✓ $NAME serves the release"; break
  fi
  [ "$i" = 15 ] && { echo "✗ $NAME does not answer"; docker logs --tail=30 "$NAME"; exit 1; }
  sleep 2
done

# working desk: a secret shared by the assistant (desk server) and the runner, made once
TOKF="$ROOT/desk-runner.token"
[ -s "$TOKF" ] || (umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$TOKF")
chmod 600 "$TOKF"
(umask 077; printf 'HQ_DESK_RUNNER_TOKEN=%s\n' "$(cat "$TOKF")" > "$ROOT/desk.env")

# personal assistant: recreated on every deploy so it picks up new code and secrets
A="$ROOT/assistant"
if [ -f "$A/releases/$REL/server.mjs" ]; then
  ln -sfn "releases/$REL" "$A/current.tmp" && mv -Tf "$A/current.tmp" "$A/current"
  ls -1dt "$A"/releases/* | tail -n +4 | xargs -r rm -rf
  mkdir -p "$ROOT/assistant-data" && chown 1000:1000 "$ROOT/assistant-data"
  touch "$ROOT/assistant.env" && chmod 600 "$ROOT/assistant.env"
  docker rm -f "$ANAME" >/dev/null 2>&1 || true
  docker run -d --name "$ANAME" --restart unless-stopped --network edge --memory 256m --user 1000:1000 \
    --env-file "$ROOT/assistant.env" --env-file "$ROOT/desk.env" -e OFFICE_DIR=/srv/current -e DATA_DIR=/data -e PROJECT_MAP=/srv/assistant/current/project-map.md \
    -v "$ROOT":/srv:ro -v "$ROOT/assistant-data":/data -w /srv/assistant/current node:22-alpine node server.mjs >/dev/null
  for i in $(seq 1 15); do
    if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$ANAME:8787/api/assistant/health" 2>/dev/null; then
      echo "✓ $ANAME answers ($(docker logs --tail=1 "$ANAME" 2>&1))"; break
    fi
    [ "$i" = 15 ] && { echo "✗ $ANAME does not answer"; docker logs --tail=30 "$ANAME"; exit 1; }
    sleep 2
  done
fi

# runner of the working desk: under the bots' user, restarted only when its code changes
# (a restart drops the task in progress — the desk puts it back in the queue)
RUSER="${HQ_RUNNER_USER:-iliapaliy}"
R="$ROOT/runner/releases/$REL"
if [ -f "$R/runner.py" ] && id "$RUSER" >/dev/null 2>&1; then
  ls -1dt "$ROOT"/runner/releases/* | tail -n +4 | xargs -r rm -rf
  RH=$(getent passwd "$RUSER" | cut -d: -f6); RD="$RH/hq-runner"
  install -d -o "$RUSER" -g "$RUSER" -m 755 "$RD" "$RD/jobs"
  ENVT=$(mktemp); printf 'HQ_DESK_RUNNER_TOKEN=%s\nHQ_DESK_API=https://%s/api/assistant/desk\n' "$(cat "$TOKF")" "$DOMAIN" > "$ENVT"
  UNIT=$(mktemp); sed -e "s#@USER@#$RUSER#g" -e "s#@HOME@#$RH#g" "$R/hq-runner.service" > "$UNIT"
  changed=0
  cmp -s "$R/runner.py" "$RD/runner.py" || changed=1
  cmp -s "$ENVT" "$RD/runner.env" || changed=1
  cmp -s "$UNIT" /etc/systemd/system/hq-runner.service || changed=1
  install -o "$RUSER" -g "$RUSER" -m 644 "$R/runner.py" "$RD/runner.py"
  install -o "$RUSER" -g "$RUSER" -m 600 "$ENVT" "$RD/runner.env"
  install -m 644 "$UNIT" /etc/systemd/system/hq-runner.service
  rm -f "$ENVT" "$UNIT"
  systemctl daemon-reload
  systemctl enable hq-runner >/dev/null 2>&1 || true
  if [ "$changed" = 1 ] || ! systemctl is-active -q hq-runner; then systemctl restart hq-runner; echo "✓ runner (re)started"; else echo "✓ runner unchanged"; fi
  CL="$RH/.local/bin/claude"
  if [ -x "$CL" ]; then echo "  claude: $(timeout 30 runuser -u "$RUSER" -- "$CL" --version 2>&1 | head -1)"; else echo "::warning::claude not found at $CL — tasks will wait in the queue"; fi
  echo "  skills: $(ls -d "$RH"/.claude/skills/*/ 2>/dev/null | wc -l) · python: $(python3 --version 2>&1)"
  sleep 4; systemctl is-active hq-runner >/dev/null && echo "  runner: $(tail -n 2 "$RD/runner.log" 2>/dev/null | tr '\n' ' ')" || { echo "::warning::hq-runner is not running"; tail -n 20 "$RD/runner.log" 2>/dev/null || true; }
else
  echo "::warning::desk runner not installed: no user $RUSER or no runner files — tasks will wait in the queue"
fi

TMP=$(mktemp)
printf '# Living office of agents — managed by .github/workflows/deploy-hq-office.yml\n%s {\n\thandle /api/assistant/* {\n\t\treverse_proxy %s:8787 {\n\t\t\tflush_interval -1\n\t\t}\n\t}\n\thandle {\n\t\tencode zstd gzip\n\t\theader Cache-Control "no-cache"\n\t\treverse_proxy %s:8080\n\t}\n}\n' "$DOMAIN" "$ANAME" "$NAME" > "$TMP"
if [ -f "$SITE" ] && cmp -s "$TMP" "$SITE"; then rm -f "$TMP"; echo "✓ edge site unchanged"; exit 0; fi
[ -f "$SITE" ] && cp "$SITE" "$SITE.bak"
install -m 644 "$TMP" "$SITE"; rm -f "$TMP"
if docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  docker exec "$EDGE" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "✓ edge caddy: https://$DOMAIN"
else
  docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5 || true
  if [ -f "$SITE.bak" ]; then mv "$SITE.bak" "$SITE"; else rm -f "$SITE"; fi
  echo "✗ edge caddy config invalid — site file restored, nothing else changed"
  exit 1
fi
