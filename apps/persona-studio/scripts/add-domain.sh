#!/usr/bin/env bash
# Attach a custom (sub)domain to Persona Studio on the prod box.
#
#   sudo bash apps/persona-studio/scripts/add-domain.sh app.example.com
#
# Before running: DNS A-record <subdomain> → 46.62.215.11 (GoDaddy → DNS →
# Add record, type A, TTL 600) and it must already resolve, otherwise Caddy
# can't get the Let's Encrypt certificate.
#
# What it does (idempotent):
#   1. Backs up /etc/caddy/Caddyfile and appends a site block
#      <domain> → reverse_proxy localhost:3020 (the persona-studio-web port).
#   2. Validates and reloads Caddy (no restart, other sites keep running).
#   3. If the app .env pins AUTH_URL / NEXTAUTH_URL, points it at the new
#      domain (auth uses trustHost, so without these it follows the Host header).
set -euo pipefail

DOMAIN="${1:-}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
APP_ENV="${APP_ENV:-/root/ai-command-center/apps/persona-studio/.env}"
UPSTREAM="${UPSTREAM:-localhost:3020}"
SERVER_IP="${SERVER_IP:-46.62.215.11}"

if [ -z "$DOMAIN" ]; then
  echo "usage: $0 <domain>   e.g. $0 app.example.com" >&2
  exit 1
fi

resolved="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [ "$resolved" != "$SERVER_IP" ]; then
  echo "✗ $DOMAIN resolves to '${resolved:-nothing}', expected $SERVER_IP." >&2
  echo "  Add the A-record in GoDaddy and wait a few minutes, then re-run." >&2
  exit 1
fi
echo "✓ DNS: $DOMAIN → $resolved"

stamp="$(date +%Y%m%d_%H%M%S)"
if grep -qE "^[[:space:]]*${DOMAIN//./\\.}[[:space:]]*\{" "$CADDYFILE"; then
  echo "✓ Caddy already has a block for $DOMAIN — leaving it"
else
  cp "$CADDYFILE" "$CADDYFILE.bak.$stamp"
  cat >> "$CADDYFILE" <<EOF

# Persona Studio — custom domain (added $stamp by add-domain.sh)
$DOMAIN {
	encode zstd gzip
	request_body {
		max_size 600MB
	}
	reverse_proxy $UPSTREAM {
		transport http {
			read_timeout 15m
			write_timeout 15m
		}
	}
}
EOF
  echo "✓ Caddy block added (backup: $CADDYFILE.bak.$stamp)"
fi

if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null; then
  echo "✗ Caddyfile invalid — restoring backup" >&2
  [ -f "$CADDYFILE.bak.$stamp" ] && cp "$CADDYFILE.bak.$stamp" "$CADDYFILE"
  exit 1
fi
systemctl reload caddy
echo "✓ Caddy reloaded"

if [ -f "$APP_ENV" ] && grep -qE '^(AUTH_URL|NEXTAUTH_URL)=' "$APP_ENV"; then
  cp "$APP_ENV" "$APP_ENV.bak.$stamp"
  sed -i -E "s#^(AUTH_URL|NEXTAUTH_URL)=.*#\1=https://$DOMAIN#" "$APP_ENV"
  echo "✓ $APP_ENV: AUTH_URL → https://$DOMAIN (restart persona-studio-web to apply)"
fi

for i in $(seq 1 20); do
  if curl -fsS -o /dev/null "https://$DOMAIN/sign-in"; then
    echo "✓ https://$DOMAIN is live"
    exit 0
  fi
  sleep 3
done
echo "… certificate may still be issuing — check: journalctl -u caddy -n 50" >&2
