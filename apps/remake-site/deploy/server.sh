#!/usr/bin/env bash
# Activate an uploaded release of the «Ремейк залёта» site on the aicex box (vars.HETZNER_HOST, where *.aicex.club points).
# Run by .github/workflows/deploy-remake-site.yml:  ssh … bash -s -- <domain> <release> < server.sh
#
# Layout:  /opt/remake-site/releases/<release>/   built page (index.html), seed/, the API image context (Dockerfile,
#                                                 server.mjs, studio.mjs, package*.json, skill/)
#          /opt/remake-site/current → releases/<release>   switched atomically
#          /opt/remake-site/data/{runs,media,studio,state.json}   runs and studio clips — never replaced by a deploy
#          /opt/remake-site/api.env                        site token, studio password, HeyGen/ElevenLabs/Anthropic/Apify keys (workflow)
#          /opt/remake-site/kadrik.env                     montage through Studio Kadrik: its PERSONA_API_KEY and address,
#                                                          read here from Kadrik's own .env (KADRIK_HOME, default /home/iliapaliy)
# Containers on the shared `edge` network: aicex-remake-site (caddy: the page + /media with range requests),
# aicex-remake-api (image aicex-remake-api:<release>: /api/*, the studio). Kadrik's skill catalog (creator-pack public/
# and ~/.claude/skills) is mounted read-only so the studio lists the same montage styles. The edge Caddy gets
# /opt/edge/sites/remake-site.caddy (validate → reload, restore on failure).
set -euo pipefail
DOMAIN="${1:?usage: server.sh <domain> <release>}"
REL="${2:?usage: server.sh <domain> <release>}"
ROOT=/opt/remake-site
NAME=aicex-remake-site
ANAME=aicex-remake-api
IMAGE=aicex-remake-api
SITE=/opt/edge/sites/remake-site.caddy
EDGE="${EDGE_CADDY:-persona-studio-caddy-1}"
KHOME="${KADRIK_HOME:-/home/iliapaliy}"
KENV="$KHOME/studio-kadrik-bot/.env"

[ -f "$ROOT/releases/$REL/index.html" ] || { echo "✗ release $REL not uploaded"; exit 1; }
[ -f "$ROOT/releases/$REL/Dockerfile" ] || { echo "✗ release $REL has no Dockerfile"; exit 1; }

# the API image first: if it does not build, the live site stays as it was
docker build -q -t "$IMAGE:$REL" --build-arg YTDLP_REFRESH="$(date -u +%G%V)" "$ROOT/releases/$REL" >/dev/null
echo "✓ image $IMAGE:$REL"

ln -sfn "releases/$REL" "$ROOT/current.tmp" && mv -Tf "$ROOT/current.tmp" "$ROOT/current"
ls -1dt "$ROOT"/releases/* | tail -n +4 | xargs -r rm -rf
echo "✓ current → $REL"

# live data: seed runs and media only fill in what is missing — a run the API already wrote wins
mkdir -p "$ROOT/data/runs" "$ROOT/data/media" "$ROOT/data/studio"
cp -n "$ROOT/current/seed/runs/"*.json "$ROOT/data/runs/" 2>/dev/null || true
cp -n "$ROOT/current/seed/media/"* "$ROOT/data/media/" 2>/dev/null || true
chown -R 1000:1000 "$ROOT/data"
touch "$ROOT/api.env" && chmod 600 "$ROOT/api.env"

# Studio Kadrik: the key of its server API and its public address, from its own .env (only on this box, never in git)
kval() { [ -f "$KENV" ] && grep -E "^$1=" "$KENV" | tail -1 | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^["'\'']//' -e 's/["'\'']$//' || true; }
KKEY="$(kval PERSONA_API_KEY)"
KURL="$(kval MINIAPP_PUBLIC_URL)"; KURL="${KURL:-https://kadrik.aicex.club}"
KPACK="$(kval PACK_DIR)"; KPACK="${KPACK:-$KHOME/creator-pack-miniapp}"; KPACK="${KPACK/#\~/$KHOME}"
umask 077
{
  printf 'KADRIK_URL=%s\n' "$KURL"
  printf 'KADRIK_API_KEY=%s\n' "$KKEY"
  # no ElevenLabs key among the GitHub secrets → the one Kadrik already uses for its montage subtitles
  if ! grep -qE '^ELEVENLABS_API_KEY=.+' "$ROOT/api.env"; then printf 'ELEVENLABS_API_KEY=%s\n' "$(kval ELEVENLABS_API_KEY)"; fi
} > "$ROOT/kadrik.env"
umask 022
if [ -n "$KKEY" ]; then echo "✓ montage: Studio Kadrik at $KURL"; else echo "! montage off: no PERSONA_API_KEY in $KENV — the studio stops at the avatar"; fi
MOUNTS=()
if [ -f "$KPACK/public/skills.json" ]; then MOUNTS+=(--mount "type=bind,src=$KPACK/public,dst=/kadrik/pack,readonly"); else echo "! no $KPACK/public/skills.json — montage styles from the skill config"; fi
[ -d "$KHOME/.claude/skills" ] && MOUNTS+=(--mount "type=bind,src=$KHOME/.claude/skills,dst=/kadrik/skills,readonly")

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
docker run -d --name "$ANAME" --restart unless-stopped --network edge --memory 1536m --user 1000:1000 \
  --env-file "$ROOT/api.env" --env-file "$ROOT/kadrik.env" -e DATA_DIR=/data -e PORT=8790 -e PUBLIC_URL="https://$DOMAIN" \
  -v "$ROOT/data":/data ${MOUNTS[@]+"${MOUNTS[@]}"} "$IMAGE:$REL" >/dev/null

for i in $(seq 1 15); do
  if docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$NAME:8080/" 2>/dev/null &&
     docker run --rm --network edge curlimages/curl:8.11.1 -fsS -o /dev/null --max-time 5 "http://$ANAME:8790/api/health" 2>/dev/null; then
    echo "✓ $NAME and $ANAME answer ($(docker logs --tail=1 "$ANAME" 2>&1))"; break
  fi
  [ "$i" = 15 ] && { echo "✗ the site does not answer"; docker logs --tail=30 "$NAME"; docker logs --tail=30 "$ANAME"; exit 1; }
  sleep 2
done
# images of releases that are gone
for t in $(docker images "$IMAGE" --format '{{.Tag}}'); do [ -d "$ROOT/releases/$t" ] || docker rmi "$IMAGE:$t" >/dev/null 2>&1 || true; done

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
