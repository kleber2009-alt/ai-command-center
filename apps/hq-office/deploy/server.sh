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
  docker run -d --name "$ANAME" --restart unless-stopped --network edge --memory 768m --user 1000:1000 \
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
  # the transcriber transcribes with the assistant's ElevenLabs key (without it — keys from the user's shell rc)
  EK=$(grep -m1 '^ELEVENLABS_API_KEY=' "$ROOT/assistant.env" 2>/dev/null | cut -d= -f2- || true)
  [ -n "$EK" ] && printf 'ELEVENLABS_API_KEY=%s\n' "$EK" >> "$ENVT"
  UNIT=$(mktemp); sed -e "s#@USER@#$RUSER#g" -e "s#@HOME@#$RH#g" "$R/hq-runner.service" > "$UNIT"
  changed=0
  cmp -s "$R/runner.py" "$RD/runner.py" || changed=1
  cmp -s "$ENVT" "$RD/runner.env" || changed=1
  cmp -s "$UNIT" /etc/systemd/system/hq-runner.service || changed=1
  install -o "$RUSER" -g "$RUSER" -m 644 "$R/runner.py" "$RD/runner.py"
  # skills of the office's own agents (Транскрибатор, Статистика соцсетей, Балансы и подписки): for the runner and Claude Code of the bots' user
  install -d -o "$RUSER" -g "$RUSER" "$RH/.claude" "$RH/.claude/skills"
  for sk in "$R"/skills/*/; do
    [ -d "$sk" ] || continue
    n=$(basename "$sk"); rm -rf "$RH/.claude/skills/$n" && cp -r "$sk" "$RH/.claude/skills/$n" && chown -R "$RUSER:$RUSER" "$RH/.claude/skills/$n"
  done
  # yt-dlp for the transcriber: the standalone zipapp (needs only python3) into the user's ~/.local/bin, on the service's PATH
  if ! command -v yt-dlp >/dev/null && [ ! -x "$RH/.local/bin/yt-dlp" ]; then
    install -d -o "$RUSER" -g "$RUSER" "$RH/.local" "$RH/.local/bin"
    if curl -fsSL --max-time 120 -o "$RH/.local/bin/yt-dlp" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp; then
      chown "$RUSER:$RUSER" "$RH/.local/bin/yt-dlp" && chmod 755 "$RH/.local/bin/yt-dlp" && echo "✓ yt-dlp installed for the transcriber"
    else rm -f "$RH/.local/bin/yt-dlp"; echo "::warning::yt-dlp could not be downloaded — the transcriber needs it to download by link"; fi
  fi
  [ -x "$RH/.local/bin/yt-dlp" ] && echo "  yt-dlp: $(runuser -u "$RUSER" -- "$RH/.local/bin/yt-dlp" --version 2>&1 | head -1)"
  command -v ffmpeg >/dev/null || echo "::warning::ffmpeg not found — the transcriber sends the whole video to ElevenLabs"
  # keys of the morning agents — read only by their scripts (HQ_KEYS_FILE), not put into the runner's environment
  [ -f "$ROOT/runner-keys.env" ] && install -o "$RUSER" -g "$RUSER" -m 600 "$ROOT/runner-keys.env" "$RD/keys.env"
  # systems of the runner (MCP: ChatPlace, Windsor, HeyGen…) — read on start, so a change restarts the runner
  if [ -f "$ROOT/runner-mcp.json" ]; then
    cmp -s "$ROOT/runner-mcp.json" "$RD/mcp.json" || changed=1
    install -o "$RUSER" -g "$RUSER" -m 600 "$ROOT/runner-mcp.json" "$RD/mcp.json"
    # local MCP servers started by uvx (HeyGen's heygen-mcp): uv into the user's ~/.local/bin, on the service's PATH
    if grep -q '"uvx"' "$RD/mcp.json" && ! command -v uvx >/dev/null && [ ! -x "$RH/.local/bin/uvx" ]; then
      if runuser -u "$RUSER" -- sh -c 'curl -LsSf --max-time 120 https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh' >/dev/null 2>&1; then echo "✓ uv installed for local MCP servers"
      else echo "::warning::uv could not be installed — MCP servers started by uvx (HeyGen) will not run"; fi
    fi
    if grep -q '"uvx"' "$RD/mcp.json"; then
      # warm the package cache once, so the first task does not wait for the download
      runuser -u "$RUSER" -- env PATH="$RH/.local/bin:$PATH" timeout 60 uvx heygen-mcp </dev/null >/dev/null 2>&1 || true
    fi
  elif [ -f "$RD/mcp.json" ]; then
    rm -f "$RD/mcp.json" "$RD/mcp.claude.json"; changed=1
  fi
  install -o "$RUSER" -g "$RUSER" -m 600 "$ENVT" "$RD/runner.env"
  install -m 644 "$UNIT" /etc/systemd/system/hq-runner.service
  rm -f "$ENVT" "$UNIT"
  systemctl daemon-reload
  systemctl enable hq-runner >/dev/null 2>&1 || true
  LS=$(stat -c %s "$RD/runner.log" 2>/dev/null || echo 0)
  if [ "$changed" = 1 ] || ! systemctl is-active -q hq-runner; then systemctl restart hq-runner; echo "✓ runner (re)started"; else echo "✓ runner unchanged"; LS=; fi
  CL="$RH/.local/bin/claude"
  if [ -x "$CL" ]; then echo "  claude: $(timeout 30 runuser -u "$RUSER" -- "$CL" --version 2>&1 | head -1)"; else echo "::warning::claude not found at $CL — tasks will wait in the queue"; fi
  echo "  skills: $(ls -d "$RH"/.claude/skills/*/ 2>/dev/null | wc -l) · python: $(python3 --version 2>&1)"
  [ -f "$RH/hq-runner/claude.env" ] && echo "  claude.env: есть (вход задан владельцем)"
  # after a restart the runner checks Claude Code once: wait for the verdict (sign-in source and error text only)
  if [ -n "$LS" ]; then
    for i in $(seq 1 40); do tail -c +$((LS + 1)) "$RD/runner.log" 2>/dev/null | grep -q "проверка Claude" && break; sleep 3; done
    tail -c +$((LS + 1)) "$RD/runner.log" 2>/dev/null | grep -E "hq runner|вход Claude|проверка Claude|^[0-9: -]+ mcp " | sed 's/^/  /' || true
    tail -c +$((LS + 1)) "$RD/runner.log" 2>/dev/null | grep -q "проверка Claude: ок" || echo "::warning::Claude Code does not start for the runner — see the line above"
  fi
  systemctl is-active -q hq-runner || { echo "::warning::hq-runner is not running"; tail -n 20 "$RD/runner.log" 2>/dev/null || true; }
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
