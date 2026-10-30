#!/usr/bin/env bash
# Activate an uploaded release of the five practicum versions on the aicex box (vars.HETZNER_HOST).
# Run by .github/workflows/deploy-practicum.yml:  ssh … bash -s -- <base-domain> <release> < server.sh
#
# Layout:  /opt/practicum/releases/<release>/   v1..v5/index.html, assets/, shared.css, shared.js
#          /opt/practicum/current → releases/<release>   switched atomically
# A tiny static container (aicex-practicum, caddy file-server) on the shared `edge` network serves
# /opt/practicum/current; the edge Caddy gets /opt/edge/sites/practicum.caddy where
# practicumN.<base-domain>/ shows vN/index.html (validate → reload, restore on failure).
set -euo pipefail
BASE="${1:?usage: server.sh <base-domain> <release>}"
REL="${2:?usage: server.sh <base-domain> <release>}"
ROOT=/opt/practicum
NAME=aicex-practicum
SITE=/opt/edge/sites/practicum.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"

for v in 1 2 3 4 5; do
  [ -f "$ROOT/releases/$REL/v$v/index.html" ] || { echo "✗ release $REL has no v$v"; exit 1; }
done
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
  if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$NAME:8080/v1/index.html" 2>/dev/null; then
    echo "✓ $NAME serves the release"; break
  fi
  [ "$i" = 15 ] && { echo "✗ $NAME does not answer"; docker logs --tail=30 "$NAME"; exit 1; }
  sleep 2
done

TMP=$(mktemp)
echo '# Practicum versions — managed by .github/workflows/deploy-practicum.yml' > "$TMP"
for v in 1 2 3 4 5; do
  printf 'practicum%s.%s {\n\tencode zstd gzip\n\theader Cache-Control "no-cache"\n\trewrite / /v%s/index.html\n\treverse_proxy %s:8080\n}\n' "$v" "$BASE" "$v" "$NAME" >> "$TMP"
done
if [ -f "$SITE" ] && cmp -s "$TMP" "$SITE"; then rm -f "$TMP"; echo "✓ edge site unchanged"; exit 0; fi
[ -f "$SITE" ] && cp "$SITE" "$SITE.bak"
install -m 644 "$TMP" "$SITE"; rm -f "$TMP"
if docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  docker exec "$EDGE" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "✓ edge caddy: https://practicum{1..5}.$BASE"
else
  docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5 || true
  if [ -f "$SITE.bak" ]; then mv "$SITE.bak" "$SITE"; else rm -f "$SITE"; fi
  echo "✗ edge caddy config invalid — site file restored, nothing else changed"
  exit 1
fi
