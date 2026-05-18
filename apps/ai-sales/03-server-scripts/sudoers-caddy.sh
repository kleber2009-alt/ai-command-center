#!/usr/bin/env bash
# Grant the `aisales` user passwordless sudo on a narrow set of
# Caddy-ops commands so Claude (or anyone SSHed as aisales) can edit
# the Caddyfile and reload Caddy without typing a sudo password.
#
# Run on the prod host as root:
#   sudo bash apps/ai-sales/03-server-scripts/sudoers-caddy.sh
#
# Idempotent: re-running just rewrites /etc/sudoers.d/caddy-ops.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
	echo "ERROR: must be run as root (sudo bash $0)" >&2
	exit 1
fi

TARGET_USER="${TARGET_USER:-aisales}"
SUDOERS_FILE="/etc/sudoers.d/caddy-ops"

if ! id -u "$TARGET_USER" >/dev/null 2>&1; then
	echo "ERROR: user '$TARGET_USER' does not exist on this host" >&2
	exit 1
fi

# Resolve real paths once so the sudoers Cmnd_Alias matches what's on
# disk (Debian/Ubuntu has /usr/bin/cp; older distros use /bin/cp).
CP="$(command -v cp)"
TEE="$(command -v tee)"
SYSTEMCTL="$(command -v systemctl)"
CADDY="$(command -v caddy || true)"
DOCKER="$(command -v docker || true)"

if [[ -z "$CADDY" && -z "$DOCKER" ]]; then
	echo "WARN: neither 'caddy' nor 'docker' found in PATH — adjust the sudoers file by hand if Caddy runs differently here." >&2
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
	echo "# Managed by apps/ai-sales/03-server-scripts/sudoers-caddy.sh"
	echo "# Narrow NOPASSWD rules so $TARGET_USER can edit + reload Caddy"
	echo "# without a password. Everything else still prompts."
	echo
	echo "Cmnd_Alias CADDY_FILE_OPS = \\"
	echo "    $CP /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.*, \\"
	echo "    $CP /tmp/Caddyfile.new /etc/caddy/Caddyfile, \\"
	echo "    $TEE /etc/caddy/Caddyfile"
	echo
	if [[ -n "$CADDY" ]]; then
		echo "Cmnd_Alias CADDY_VALIDATE = \\"
		echo "    $CADDY validate --config /etc/caddy/Caddyfile --adapter caddyfile, \\"
		echo "    $CADDY validate --config /etc/caddy/Caddyfile, \\"
		echo "    $CADDY fmt --overwrite /etc/caddy/Caddyfile"
		echo
	fi
	echo "Cmnd_Alias CADDY_SERVICE = \\"
	echo "    $SYSTEMCTL reload caddy, \\"
	echo "    $SYSTEMCTL restart caddy, \\"
	echo "    $SYSTEMCTL status caddy, \\"
	echo "    $SYSTEMCTL start caddy, \\"
	echo "    $SYSTEMCTL stop caddy"
	echo
	if [[ -n "$DOCKER" ]]; then
		# If Caddy ships inside the ai-sales docker-compose stack
		# instead of as a host service, allow the compose-level reload.
		echo "Cmnd_Alias CADDY_DOCKER = \\"
		echo "    $DOCKER exec ai-sales-caddy caddy reload --config /etc/caddy/Caddyfile, \\"
		echo "    $DOCKER exec ai-sales-caddy caddy validate --config /etc/caddy/Caddyfile, \\"
		echo "    $DOCKER restart ai-sales-caddy"
		echo
		echo "$TARGET_USER ALL=(root) NOPASSWD: CADDY_FILE_OPS, CADDY_VALIDATE, CADDY_SERVICE, CADDY_DOCKER"
	else
		echo "$TARGET_USER ALL=(root) NOPASSWD: CADDY_FILE_OPS, CADDY_VALIDATE, CADDY_SERVICE"
	fi
} >"$TMP"

# Validate before installing so a typo can't lock everyone out.
if ! visudo -c -f "$TMP" >/dev/null; then
	echo "ERROR: visudo rejected the generated file. Aborting." >&2
	echo "Generated content:" >&2
	cat "$TMP" >&2
	exit 1
fi

install -m 0440 -o root -g root "$TMP" "$SUDOERS_FILE"

echo "OK: installed $SUDOERS_FILE for user '$TARGET_USER'."
echo
echo "Smoke-test from a $TARGET_USER shell (should NOT prompt for a password):"
echo "    sudo -n $SYSTEMCTL status caddy"
echo "    sudo -n $CP /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.\$(date +%s)"
