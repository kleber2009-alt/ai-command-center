#!/usr/bin/env bash
# Activate an uploaded release of the living office on the aicex box (vars.HETZNER_HOST).
# Run by .github/workflows/deploy-hq-office.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/hq-office/releases/<release>/   uploaded files
#          /opt/hq-office/current → releases/<release>   switched atomically
#          /opt/hq-office/assistant/releases/<release>/, assistant/current   assistant server
#          /opt/hq-office/assistant.env (secrets, written by the workflow), assistant-data/ (history, memory)
# A tiny static container (aicex-hq-office, caddy file-server) on the shared `edge` network
# serves /opt/hq-office/current; the personal assistant (aicex-hq-assistant, node) answers
# /api/assistant/*. The edge Caddy gets its own site file /opt/edge/sites/hq-office.caddy
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

# personal assistant: recreated on every deploy so it picks up new code and secrets
A="$ROOT/assistant"
if [ -f "$A/releases/$REL/server.mjs" ]; then
  ln -sfn "releases/$REL" "$A/current.tmp" && mv -Tf "$A/current.tmp" "$A/current"
  ls -1dt "$A"/releases/* | tail -n +4 | xargs -r rm -rf
  mkdir -p "$ROOT/assistant-data" && chown 1000:1000 "$ROOT/assistant-data"
  touch "$ROOT/assistant.env" && chmod 600 "$ROOT/assistant.env"
  docker rm -f "$ANAME" >/dev/null 2>&1 || true
  docker run -d --name "$ANAME" --restart unless-stopped --network edge --memory 256m --user 1000:1000 \
    --env-file "$ROOT/assistant.env" -e OFFICE_DIR=/srv/current -e DATA_DIR=/data -e PROJECT_MAP=/srv/assistant/current/project-map.md \
    -v "$ROOT":/srv:ro -v "$ROOT/assistant-data":/data -w /srv/assistant/current node:22-alpine node server.mjs >/dev/null
  for i in $(seq 1 15); do
    if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$ANAME:8787/api/assistant/health" 2>/dev/null; then
      echo "✓ $ANAME answers ($(docker logs --tail=1 "$ANAME" 2>&1))"; break
    fi
    [ "$i" = 15 ] && { echo "✗ $ANAME does not answer"; docker logs --tail=30 "$ANAME"; exit 1; }
    sleep 2
  done
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
