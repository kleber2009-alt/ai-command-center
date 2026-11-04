#!/usr/bin/env bash
# Activate an uploaded release of «CRM Директа» on the aicex box (vars.HETZNER_HOST, where *.aicex.club points).
# Run by .github/workflows/deploy-direct-crm.yml:  ssh … bash -s -- <domain>[,alias…] <release> < server.sh
#
# Layout:  /opt/direct-crm/releases/<release>/   image context (Dockerfile, server.mjs, lib/, public/, package*.json)
#          /opt/direct-crm/current → releases/<release>
#          /opt/direct-crm/data/                  crm.sqlite — every chat and message; never replaced by a deploy
#          /opt/direct-crm/app.env                ChatPlace connection, Claude key, passwords (written by the workflow)
# Container aicex-direct-crm (image aicex-direct-crm:<release>, port 8795) on the shared `edge` network; the edge Caddy
# gets /opt/edge/sites/direct-crm.caddy (validate → reload, restore on failure).
set -euo pipefail
# names come comma-separated: ssh joins its arguments into one command line, so a space would split them
DOMAINS="${1:?usage: server.sh <domain>[,alias…] <release>}"
DOMAINS="${DOMAINS//,/ }"
DOMAIN="${DOMAINS%% *}"
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

# The site answers on every name in DOMAINS (primary first). A name already served by another site is taken over only
# when that site is a separate file in /opt/edge/sites that serves nothing but this name: the file is moved to
# /opt/edge/sites-disabled (a copy, restored if the new config does not validate). A name defined in the main
# Caddyfile or in a file with other sites is left alone — the deploy says where it is and goes on without it.
EDGE_MAIN=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{if eq .Destination "/etc/caddy"}}{{.Source}}/Caddyfile{{end}}{{end}}' "$EDGE" 2>/dev/null || true)
hosts_of() { grep -Eo '^[^#{]*\{' "$1" | tr -d '{' | tr ', ' '\n\n' | sed -E 's#^https?://##; s#:[0-9]+$##' | grep -E '^[a-z0-9.-]+\.[a-z]+$' | sort -u; }
defines() { grep -Eq "(^|[[:space:],/])$(printf '%s' "$2" | sed 's/\./\\./g')([[:space:],:{]|$)" "$1"; }
NAMES=""; MOVED=()
for name in $DOMAINS; do
  blocked=""
  if [ -n "$EDGE_MAIN" ] && [ -f "$EDGE_MAIN" ] && defines "$EDGE_MAIN" "$name"; then blocked="main Caddyfile $EDGE_MAIN (line $(grep -nE "(^|[[:space:],/])${name//./\\.}" "$EDGE_MAIN" | head -1 | cut -d: -f1))"; fi
  for f in /opt/edge/sites/*.caddy; do
    [ -f "$f" ] && [ "$f" != "$SITE" ] || continue
    defines "$f" "$name" || continue
    others=$(hosts_of "$f" | grep -vx "$name" || true)
    if [ -n "$others" ]; then blocked="$f (also serves: $(echo $others))"; continue; fi
    [ -n "$blocked" ] && continue
    mkdir -p /opt/edge/sites-disabled
    dest="/opt/edge/sites-disabled/$(basename "$f").$(date -u +%Y%m%d%H%M%S)"
    mv "$f" "$dest"; MOVED+=("$dest|$f")
    echo "✓ $name: the old site $f moved to $dest — now served by the CRM"
  done
  if [ -n "$blocked" ]; then echo "! $name is defined in $blocked — left as it is, the CRM is not on $name"; continue; fi
  NAMES="${NAMES:+$NAMES, }$name"
done
[ -n "$NAMES" ] || { echo "✗ no domain left for the CRM"; exit 1; }
restore_moved() { for m in "${MOVED[@]}"; do mv "${m%%|*}" "${m##*|}"; done; }

TMP=$(mktemp)
printf '# CRM AICEX (apps/direct-crm) — managed by .github/workflows/deploy-direct-crm.yml\n%s {\n\tencode zstd gzip\n\treverse_proxy %s:8795\n}\n' "$NAMES" "$NAME" > "$TMP"
if [ -f "$SITE" ] && cmp -s "$TMP" "$SITE" && [ ${#MOVED[@]} -eq 0 ]; then rm -f "$TMP"; echo "✓ edge site unchanged: $NAMES"; exit 0; fi
[ -f "$SITE" ] && cp "$SITE" "$SITE.bak"
install -m 644 "$TMP" "$SITE"; rm -f "$TMP"
if docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  docker exec "$EDGE" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  echo "✓ edge caddy: $NAMES"
else
  docker exec "$EDGE" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5 || true
  if [ -f "$SITE.bak" ]; then mv "$SITE.bak" "$SITE"; else rm -f "$SITE"; fi
  restore_moved
  echo "✗ edge caddy config invalid — site files restored, nothing else changed"
  exit 1
fi
