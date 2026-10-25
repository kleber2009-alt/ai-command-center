#!/usr/bin/env bash
# apps/ai-sales/scripts/teardown_old_ai_office_subdomain.sh
#
# Remove ai-office.46-62-215-11.nip.io from the OLD Hetzner box
# (46.62.215.11). The legacy ai-office site was never wired into this
# repo's docker-compose — it was glued on by hand with a system-level
# Caddy block + a static directory. This script finds and removes
# both.
#
# Safe: it only touches files that mention "ai-office" or the
# ai-office.* host. docker-compose services and api.* subdomains are
# left alone.
#
# Usage (on 46.62.215.11, after `ssh aisales@46.62.215.11`):
#   sudo bash teardown_old_ai_office_subdomain.sh
#
# Dry run first (does not modify anything):
#   DRY_RUN=1 sudo bash teardown_old_ai_office_subdomain.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root. Use sudo." >&2
  exit 1
fi

DRY_RUN="${DRY_RUN:-0}"
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY: $*"
  else
    "$@"
  fi
}

say() { echo "→ $*"; }

say "scan: looking for ai-office references on this host"

# 1. system Caddyfile (installed by setup_ssl_nip_io.sh or by hand)
CADDYFILES=(/etc/caddy/Caddyfile /etc/caddy/conf.d/*.conf)
for cf in "${CADDYFILES[@]}"; do
  [[ -e "$cf" ]] || continue
  if grep -q "ai-office" "$cf" 2>/dev/null; then
    say "found ai-office block in $cf — backing up to ${cf}.bak and removing"
    run cp -a "$cf" "${cf}.bak.$(date +%Y%m%d%H%M%S)"
    # Strip any Caddy site block that mentions ai-office. Caddy
    # top-level site blocks look like:
    #   host { ... }
    # We delete from a line containing "ai-office" that ends with "{"
    # up to the matching closing brace at column 0.
    if [[ "$DRY_RUN" != "1" ]]; then
      awk '
        BEGIN{skip=0}
        skip==0 && /ai-office/ && /\{[[:space:]]*$/ {skip=1; next}
        skip==1 && /^\}/ {skip=0; next}
        skip==0 {print}
      ' "$cf" > "${cf}.new"
      mv "${cf}.new" "$cf"
    fi
  fi
done

# 2. docker-compose caddy — look for any ai-office vhost mounted into
# the aisales-caddy container. In this repo's layout nothing like that
# should exist, but on the live server extra bind-mounts may have been
# added by hand.
COMPOSE_FILES=()
while IFS= read -r f; do
  COMPOSE_FILES+=("$f")
done < <(find /opt /srv /home -maxdepth 4 -name 'docker-compose*.y*ml' 2>/dev/null || true)

for cf in "${COMPOSE_FILES[@]}"; do
  if grep -q "ai-office" "$cf" 2>/dev/null; then
    say "docker-compose file mentions ai-office: $cf (NOT auto-edited — review by hand)"
  fi
done

# 3. static files served under /srv/ai-office (if the host had its own)
if [[ -d /srv/ai-office ]]; then
  say "removing /srv/ai-office"
  run rm -rf /srv/ai-office
fi

# 4. reload Caddy so the removed vhost drops out
if systemctl is-active --quiet caddy 2>/dev/null; then
  say "reloading system Caddy"
  run systemctl reload caddy
fi
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^aisales-caddy$'; then
  say "reloading aisales-caddy (docker)"
  run docker exec aisales-caddy caddy reload --config /etc/caddy/Caddyfile || true
fi

cat <<EOF

════════════════════════════════════════════════════════
  teardown done ($( [[ $DRY_RUN == 1 ]] && echo "DRY RUN — nothing changed" || echo "applied"))
════════════════════════════════════════════════════════

Verify the subdomain is gone:
  curl -sI https://ai-office.46-62-215-11.nip.io/      # expect curl: Could not resolve host OR 404/connection refused

If a docker-compose above was flagged, open it and remove the
ai-office service / bind-mount by hand, then: docker compose up -d.
EOF
