#!/usr/bin/env bash
# Activate an uploaded release of the AI Sales CRM on the aicex box (vars.HETZNER_HOST, where *.aicex.club points).
# Run by .github/workflows/deploy-aisales-crm.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/aisales-crm/releases/<release>/   static site (index.html + assets/)
#          /opt/aisales-crm/current → releases/<release>   switched atomically, last 3 releases kept
# Container aicex-aisales-crm (caddy, static) on the shared `edge` network.
# The edge Caddy gets /opt/edge/sites/aisales-crm.caddy (validate → reload, restore on failure).
#
# Takeover: crm.aicex.club used to live in the shared /opt/edge/sites/aicex.caddy as
#   crm.aicex.club { import aisales_routes; redir / /06-dashboard-prototype/pulse.html }
# That exact block is cut out (aicex.caddy backed up first) and replaced by our site file, which keeps
# /api/* and /webhooks/* on aicex-sales-api and the old prototype paths on aicex-sales-static.
# Any other definition of the domain is printed and the script stops before touching the edge.
set -euo pipefail
DOMAIN="${1:?usage: server.sh <domain> <release>}"
REL="${2:?usage: server.sh <domain> <release>}"
ROOT=/opt/aisales-crm
NAME=aicex-aisales-crm
SITE=/opt/edge/sites/aisales-crm.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"

[ -f "$ROOT/releases/$REL/index.html" ] || { echo "✗ release $REL not uploaded"; exit 1; }

# ── guard: who serves the domain today ──
SHARED=/opt/edge/sites/aicex.caddy
LEGACY_BLOCK=$(printf '%s {\n\timport aisales_routes\n\tredir / /06-dashboard-prototype/pulse.html\n}' "$DOMAIN")
current_block() { awk -v d="$DOMAIN {" '$0 == d { on = 1 } on { print } on && $0 == "}" { exit }' "$SHARED" 2>/dev/null; }
OTHERS=$(grep -rlF "$DOMAIN" /opt/edge 2>/dev/null | grep -vxF "$SITE" | grep -v '\.bak' || true)
INLINE=$(docker exec "$EDGE" sh -c "grep -nF '$DOMAIN' /etc/caddy/Caddyfile" 2>/dev/null || true)
CUT=0
if [ "$OTHERS" = "$SHARED" ] && [ -z "$INLINE" ] && [ "$(current_block)" = "$LEGACY_BLOCK" ]; then
  CUT=1
elif [ -n "$OTHERS" ] || [ -n "$INLINE" ]; then
  echo "✗ $DOMAIN is served by an edge config this script does not know — not touching the edge."
  for f in $OTHERS; do echo "=== $f"; grep -nF -A4 "$DOMAIN" "$f"; done
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
cat > "$TMP" <<CADDY
# AI Sales CRM — managed by .github/workflows/deploy-aisales-crm.yml
$DOMAIN {
	encode zstd gzip
	handle_path /api/* {
		reverse_proxy aicex-sales-api:8000
	}
	handle /webhooks/* {
		reverse_proxy aicex-sales-api:8000
	}
	@legacy path /06-dashboard-prototype/* /01-portal/* /05-docs/* /carousels/* /reels/*
	handle @legacy {
		reverse_proxy aicex-sales-static:8080
	}
	handle {
		reverse_proxy $NAME:8080
	}
}
CADDY
if [ "$CUT" = 0 ] && [ -f "$SITE" ] && cmp -s "$TMP" "$SITE"; then rm -f "$TMP"; echo "✓ edge site unchanged"; exit 0; fi
[ -f "$SITE" ] && cp "$SITE" "$SITE.bak"
if [ "$CUT" = 1 ]; then
  BAK="$ROOT/aicex.caddy.bak.$(date -u +%Y%m%d_%H%M%S)"
  cp "$SHARED" "$BAK"
  # drop the legacy block (and its comment line) from the shared file
  awk -v d="$DOMAIN {" '
    $0 == d { skip = 1; if (held ~ /^# AI Sales CRM dashboard/) has = 0; next }
    skip { if ($0 == "}") skip = 0; next }
    { if (has) print held; held = $0; has = 1 }
    END { if (has) print held }' "$BAK" > "$SHARED.tmp"
  grep -qF "$DOMAIN" "$SHARED.tmp" && { rm -f "$SHARED.tmp"; echo "✗ could not cut $DOMAIN from $SHARED"; exit 1; }
  install -m 644 "$SHARED.tmp" "$SHARED"; rm -f "$SHARED.tmp"
  echo "✓ legacy $DOMAIN block cut from $SHARED (backup $BAK)"
fi
install -m 644 "$TMP" "$SITE"; rm -f "$TMP"
if docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  docker exec "$EDGE" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "✓ edge caddy: https://$DOMAIN"
else
  docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5 || true
  if [ -f "$SITE.bak" ]; then mv "$SITE.bak" "$SITE"; else rm -f "$SITE"; fi
  [ "$CUT" = 1 ] && cp "$BAK" "$SHARED"
  echo "✗ edge caddy config invalid — edge files restored, nothing else changed"
  exit 1
fi
