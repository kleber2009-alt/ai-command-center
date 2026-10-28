#!/usr/bin/env bash
# hq2.aicex.club on the server that *.aicex.club already points to (the one with dashboard.aicex.club).
# Run once as root:  bash setup-server.sh
# Clones/pulls the repo, copies the office into /var/www/hq-office, refreshes it from GitHub
# every 10 minutes and adds a Caddy site block (certificate is issued automatically).
set -euo pipefail
DOMAIN="${HQ_OFFICE_DOMAIN:-hq2.aicex.club}"
REPO=/opt/ai-command-center
WEB=/var/www/hq-office

if [ -d "$REPO/.git" ]; then git -C "$REPO" pull -q --ff-only
else git clone -q --depth 1 https://github.com/kleber2009-alt/ai-command-center.git "$REPO"; fi

cat > /usr/local/bin/hq-office-update <<'UPD'
#!/usr/bin/env bash
# git pull → copy apps/hq-office to the web root (atomic rename)
set -euo pipefail
REPO=/opt/ai-command-center; WEB=/var/www/hq-office
git -C "$REPO" pull -q --ff-only || echo "git pull failed — keeping current files"
rm -rf "$WEB.new"; mkdir -p "$WEB.new"
cp -r "$REPO/apps/hq-office/." "$WEB.new/"
rm -rf "$WEB.new/deploy" "$WEB.new/README.md" "$WEB.new/CLAUDE.md"
rm -rf "$WEB.old"; [ -d "$WEB" ] && mv "$WEB" "$WEB.old"; mv "$WEB.new" "$WEB"; rm -rf "$WEB.old"
UPD
chmod +x /usr/local/bin/hq-office-update
/usr/local/bin/hq-office-update
echo '*/10 * * * * root /usr/local/bin/hq-office-update >> /var/log/hq-office.log 2>&1' > /etc/cron.d/hq-office
chmod 644 /etc/cron.d/hq-office

command -v caddy >/dev/null || { echo "Caddy не найден — установите Caddy и запустите скрипт ещё раз"; exit 1; }
bash "$REPO/apps/hq-office/deploy/caddy-site.sh" "$DOMAIN" "$WEB"
echo "Готово: https://$DOMAIN  (обновление с GitHub каждые 10 минут, лог /var/log/hq-office.log)"
