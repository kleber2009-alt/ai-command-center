#!/usr/bin/env bash
# Activate an uploaded release of «CRM Директа» on the aicex box (vars.HETZNER_HOST, where *.aicex.club points).
# Run by .github/workflows/deploy-direct-crm.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/direct-crm/releases/<release>/   image context (Dockerfile, server.mjs, lib/, public/, package*.json)
#          /opt/direct-crm/current → releases/<release>
#          /opt/direct-crm/data/                  crm.sqlite — every chat and message; never replaced by a deploy
#          /opt/direct-crm/app.env                ChatPlace connection, Claude key, passwords (written by the workflow)
# Container aicex-direct-crm (image aicex-direct-crm:<release>, port 8795) on the shared `edge` network; the edge Caddy
# gets /opt/edge/sites/direct-crm.caddy (validate → reload, restore on failure).
set -euo pipefail
DOMAIN="${1:?usage: server.sh <domain> <release>}"
REL="${2:?usage: server.sh <domain> <release>}"
ROOT=/opt/direct-crm
NAME=aicex-direct-crm
IMAGE=aicex-direct-crm
SITE=/opt/edge/sites/direct-crm.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"

[ -f "$ROOT/releases/$REL/Dockerfile" ] || { echo "✗ release $REL not uploaded"; exit 1; }

# the image first: if it does not build, the live CRM stays as it was
docker build -q -t "$IMAGE:$REL" "$ROOT/releases/$REL" >/dev/null
echo "✓ image $IMAGE:$REL"

ln -sfn "releases/$REL" "$ROOT/current.tmp" && mv -Tf "$ROOT/current.tmp" "$ROOT/current"
ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
echo "✓ current → $REL"

mkdir -p "$ROOT/data"
chown -R 1000:1000 "$ROOT/data"
touch "$ROOT/app.env" && chmod 600 "$ROOT/app.env"
# a copy of the database before the new version starts (the last 7 are kept)
if [ -f "$ROOT/data/crm.sqlite" ]; then
  mkdir -p "$ROOT/backup"
  docker exec "$NAME" node -e "const{DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/crm.sqlite').exec(\"VACUUM INTO '/data/backup.sqlite'\")" >/dev/null 2>&1 \
    && mv "$ROOT/data/backup.sqlite" "$ROOT/backup/crm-$(date -u +%Y%m%d%H%M%S).sqlite" && echo "✓ database copied to $ROOT/backup" \
    || echo "! no database copy (the old container is not running)"
  ls -1t "$ROOT"/backup/crm-*.sqlite 2>/dev/null | tail -n +8 | xargs -r rm -f
fi

docker network inspect edge >/dev/null
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped --network edge --memory 512m --user 1000:1000 \
  --env-file "$ROOT/app.env" -e DATA_DIR=/data -e PORT=8795 -e PUBLIC_URL="https://$DOMAIN" \
  -v "$ROOT/data":/data "$IMAGE:$REL" >/dev/null

for i in $(seq 1 20); do
  if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$NAME:8795/api/health" 2>/dev/null; then
    echo "✓ $NAME answers ($(docker logs --tail=1 "$NAME" 2>&1))"; break
  fi
  [ "$i" = 20 ] && { echo "✗ the CRM does not answer"; docker logs --tail=40 "$NAME"; exit 1; }
  sleep 2
done
for t in $(docker images "$IMAGE" --format '{{.Tag}}'); do [ -d "$ROOT/releases/$t" ] || docker rmi "$IMAGE:$t" >/dev/null 2>&1 || true; done

TMP=$(mktemp)
printf '# CRM Директа — managed by .github/workflows/deploy-direct-crm.yml\n%s {\n\tencode zstd gzip\n\treverse_proxy %s:8795\n}\n' "$DOMAIN" "$NAME" > "$TMP"
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
