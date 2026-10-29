#!/usr/bin/env bash
# Activate an uploaded release of the «Ремейк залёта» site on the aicex box (vars.HETZNER_HOST, where *.aicex.club points).
# Run by .github/workflows/deploy-remake-site.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/remake-site/releases/<release>/   built page (index.html), seed/, server.mjs
#          /opt/remake-site/current → releases/<release>   switched atomically
#          /opt/remake-site/data/{runs,media,state.json}   live runs written through the API — never replaced by a deploy
#          /opt/remake-site/api.env                        REMAKE_SITE_TOKEN (written by the workflow)
# Containers on the shared `edge` network: aicex-remake-site (caddy: the page + /media with range requests),
# aicex-remake-api (node: /api/*). The edge Caddy gets /opt/edge/sites/remake-site.caddy (validate → reload, restore on failure).
set -euo pipefail
DOMAIN="${1:?usage: server.sh <domain> <release>}"
REL="${2:?usage: server.sh <domain> <release>}"
ROOT=/opt/remake-site
NAME=aicex-remake-site
ANAME=aicex-remake-api
SITE=/opt/edge/sites/remake-site.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"

[ -f "$ROOT/releases/$REL/index.html" ] || { echo "✗ release $REL not uploaded"; exit 1; }
ln -sfn "releases/$REL" "$ROOT/current.tmp" && mv -Tf "$ROOT/current.tmp" "$ROOT/current"
ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
echo "✓ current → $REL"

# live data: seed runs and media only fill in what is missing — a run the API already wrote wins
mkdir -p "$ROOT/data/runs" "$ROOT/data/media"
cp -n "$ROOT/current/seed/runs/"*.json "$ROOT/data/runs/" 2>/dev/null || true
cp -n "$ROOT/current/seed/media/"* "$ROOT/data/media/" 2>/dev/null || true
chown -R 1000:1000 "$ROOT/data"
touch "$ROOT/api.env" && chmod 600 "$ROOT/api.env"

docker network inspect edge >/dev/null
cat > "$ROOT/static.Caddyfile" <<'CADDY'
:8080 {
	handle_path /media/* {
		root * /srv/data/media
		header Cache-Control "public, max-age=86400"
		file_server
	}
	handle {
		root * /srv/current
		header Cache-Control "no-cache"
		file_server
	}
}
CADDY
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped --network edge --memory 64m \
  -v "$ROOT":/srv:ro -v "$ROOT/static.Caddyfile":/etc/caddy/Caddyfile:ro caddy:2.8-alpine >/dev/null
docker rm -f "$ANAME" >/dev/null 2>&1 || true
docker run -d --name "$ANAME" --restart unless-stopped --network edge --memory 128m --user 1000:1000 \
  --env-file "$ROOT/api.env" -e DATA_DIR=/data -e PORT=8790 \
  -v "$ROOT":/srv:ro -v "$ROOT/data":/data -w /srv/current node:22-alpine node server.mjs >/dev/null

for i in $(seq 1 15); do
  if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$NAME:8080/" 2>/dev/null &&
     docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$ANAME:8790/api/health" 2>/dev/null; then
    echo "✓ $NAME and $ANAME answer ($(docker logs --tail=1 "$ANAME" 2>&1))"; break
  fi
  [ "$i" = 15 ] && { echo "✗ the site does not answer"; docker logs --tail=30 "$NAME"; docker logs --tail=30 "$ANAME"; exit 1; }
  sleep 2
done

TMP=$(mktemp)
printf '# «Ремейк залёта» — managed by .github/workflows/deploy-remake-site.yml\n%s {\n\thandle /api/* {\n\t\treverse_proxy %s:8790\n\t}\n\thandle {\n\t\tencode zstd gzip\n\t\treverse_proxy %s:8080\n\t}\n}\n' "$DOMAIN" "$ANAME" "$NAME" > "$TMP"
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
