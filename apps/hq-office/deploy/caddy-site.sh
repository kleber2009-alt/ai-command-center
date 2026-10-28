#!/usr/bin/env bash
# Managed Caddy site block for the living office (apps/hq-office).
# Usage (as root on the server): caddy-site.sh "<domain>[, <domain>…]" [webroot]
# Backs up /etc/caddy/Caddyfile, replaces only the "# >>> hq-office … # <<< hq-office" block,
# validates and reloads; restores the backup if validation fails. Safe to run repeatedly.
set -euo pipefail
DOMAINS="${1:?usage: caddy-site.sh \"hq2.aicex.club, hq2.46-62-215-11.nip.io\" [/var/www/hq-office]}"
WEB="${2:-/var/www/hq-office}"
CF=/etc/caddy/Caddyfile
TAG=$(printf '%s|%s' "$DOMAINS" "$WEB" | sha256sum | cut -c1-12)

if grep -q "# >>> hq-office $TAG" "$CF" 2>/dev/null; then
  echo "caddy: block for $DOMAINS is up to date"
  exit 0
fi

touch "$CF"
BAK="$CF.bak.$(date +%Y%m%d_%H%M%S)"
cp "$CF" "$BAK"
python3 - "$CF" "$DOMAINS" "$WEB" "$TAG" <<'PY'
import re, sys
cf, domains, web, tag = sys.argv[1:]
s = open(cf).read()
s = re.sub(r"\n?# >>> hq-office.*?# <<< hq-office\n?", "\n", s, flags=re.S)
block = (f"\n# >>> hq-office {tag} (managed by apps/hq-office/deploy/caddy-site.sh)\n"
         f"{domains} {{\n\troot * {web}\n\tencode gzip zstd\n"
         f"\theader Cache-Control \"no-cache\"\n\theader X-Content-Type-Options \"nosniff\"\n"
         f"\tfile_server\n}}\n# <<< hq-office\n")
open(cf, "w").write(s.rstrip("\n") + "\n" + block)
PY

if OUT=$(caddy validate --config "$CF" --adapter caddyfile 2>&1); then
  systemctl reload caddy 2>/dev/null || caddy reload --config "$CF" --adapter caddyfile
  echo "caddy: $DOMAINS → $WEB (backup $BAK)"
else
  cp "$BAK" "$CF"
  echo "caddy validate failed — restored $BAK, nothing changed:"
  echo "$OUT" | tail -8
  exit 1
fi
