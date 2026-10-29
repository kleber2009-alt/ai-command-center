#!/usr/bin/env bash
# Activate an uploaded release of the AI Sales CRM on the aicex box (vars.HETZNER_HOST, where *.aicex.club points).
# Run by .github/workflows/deploy-aisales-crm.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/aisales-crm/releases/<release>/   static site (index.html + assets/)
#          /opt/aisales-crm/current → releases/<release>   switched atomically, last 3 releases kept
# Container aicex-aisales-crm (caddy, static) on the shared `edge` network.
# The edge Caddy gets /opt/edge/sites/aisales-crm.caddy (validate → reload, restore on failure).
#
# Takeover guard: if <domain> is already served by another edge config (the old 06-dashboard-prototype
# site), that config is printed and the script stops before touching the edge — nothing changes on prod.
# Rerun with ALLOW_TAKEOVER=1 only after that config has been reviewed and moved aside.
set -euo pipefail
DOMAIN="${1:?usage: server.sh <domain> <release>}"
REL="${2:?usage: server.sh <domain> <release>}"
ROOT=/opt/aisales-crm
NAME=aicex-aisales-crm
SITE=/opt/edge/sites/aisales-crm.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"

[ -f "$ROOT/releases/$REL/index.html" ] || { echo "✗ release $REL not uploaded"; exit 1; }

# ── guard: who serves the domain today ──
OTHERS=$(grep -rlF "$DOMAIN" /opt/edge 2>/dev/null | grep -vxF "$SITE" | grep -v '\.bak' || true)
INLINE=$(docker exec "$EDGE" sh -c "grep -nF '$DOMAIN' /etc/caddy/Caddyfile" 2>/dev/null || true)
if { [ -n "$OTHERS" ] || [ -n "$INLINE" ]; } && [ "${ALLOW_TAKEOVER:-0}" != 1 ]; then
  echo "✗ $DOMAIN is already served by another edge config — not touching the edge."
  for f in $OTHERS; do echo "=== $f"; cat "$f"; done
  [ -n "$INLINE" ] && { echo "=== edge /etc/caddy/Caddyfile"; echo "$INLINE"; }
  exit 1
fi

ln -sfn "releases/$REL" "$ROOT/current.tmp" && mv -Tf "$ROOT/current.tmp" "$ROOT/current"
ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
echo "✓ current → $REL"

docker network inspect edge >/dev/null
cat > "$ROOT/static.Caddyfile" <<'CADDY'
:8080 {
	root * /srv/current
	@assets path /assets/*
	header @assets Cache-Control "public, max-age=300"
	header Cache-Control "no-cache"
	file_server
}
CADDY
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped --network edge --memory 64m \
  -v "$ROOT":/srv:ro -v "$ROOT/static.Caddyfile":/etc/caddy/Caddyfile:ro caddy:2.8-alpine >/dev/null

for i in $(seq 1 15); do
  if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$NAME:8080/" 2>/dev/null; then
    echo "✓ $NAME answers"; break
  fi
  [ "$i" = 15 ] && { echo "✗ $NAME does not answer"; docker logs --tail=30 "$NAME"; exit 1; }
  sleep 2
done

TMP=$(mktemp)
printf '# AI Sales CRM — managed by .github/workflows/deploy-aisales-crm.yml\n%s {\n\tencode zstd gzip\n\treverse_proxy %s:8080\n}\n' "$DOMAIN" "$NAME" > "$TMP"
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
