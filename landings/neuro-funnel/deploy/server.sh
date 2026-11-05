#!/usr/bin/env bash
# Activate an uploaded release of the selling site of «Нейроворонка» on the aicex box (vars.HETZNER_HOST).
# Run by .github/workflows/deploy-neuro-landing.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/neuro-landing/releases/<release>/   index.html, oferta.html, soglasie.html, privacy.html, img/
#          /opt/neuro-landing/current → releases/<release>   switched atomically, the last 3 releases kept
# A tiny static container (aicex-neuro-landing, caddy file-server) on the shared `edge` network serves
# /opt/neuro-landing/current; the edge Caddy gets /opt/edge/sites/neuro-landing.caddy (validate → reload, restore on failure).
set -euo pipefail
DOMAIN="${1:?usage: server.sh <domain> <release>}"
REL="${2:?usage: server.sh <domain> <release>}"
ROOT=/opt/neuro-landing
NAME=aicex-neuro-landing
SITE=/opt/edge/sites/neuro-landing.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"

[ -f "$ROOT/releases/$REL/index.html" ] || { echo "✗ release $REL has no index.html"; exit 1; }
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
  if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$NAME:8080/index.html" 2>/dev/null; then
    echo "✓ $NAME serves the release"; break
  fi
  [ "$i" = 15 ] && { echo "✗ $NAME does not answer"; docker logs --tail=30 "$NAME"; exit 1; }
  sleep 2
done

TMP=$(mktemp)
printf '# Selling site of Нейроворонка — managed by .github/workflows/deploy-neuro-landing.yml\n%s {\n\tencode zstd gzip\n\t@html path / *.html\n\theader @html Cache-Control "no-cache"\n\theader /img/* Cache-Control "public, max-age=86400"\n\treverse_proxy %s:8080\n}\n' "$DOMAIN" "$NAME" > "$TMP"
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
