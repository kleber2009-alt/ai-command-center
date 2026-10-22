#!/usr/bin/env bash
# Дашборд «Академия нейросетей» на этом сервере: dashboard.aicex.club
# Запуск под root: FUNNEL_DATA_KEY=... bash setup-server.sh  (config.json заранее в /opt/funnel-analytics-data)
# Ставит код, cron-обновление каждые 3 часа и сайт в Caddy/nginx. Можно запускать повторно.
set -euo pipefail
DOMAIN="dashboard.aicex.club"
REPO=/opt/ai-command-center
DATA=/opt/funnel-analytics-data
WEB=/var/www/funnel-analytics
DATA_KEY="${FUNNEL_DATA_KEY:?export FUNNEL_DATA_KEY=... (ключ данных вкладки «Контент»)}"

echo "── 1/5 пакеты"
if command -v apt-get >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git python3 openssl curl ca-certificates gzip >/dev/null
else
  for c in git python3 openssl curl; do command -v $c >/dev/null || { echo "нет $c — установите и запустите снова"; exit 1; }; done
fi

echo "── 2/5 код из GitHub"
if [ -d "$REPO/.git" ]; then git -C "$REPO" pull -q --ff-only; else git clone -q --depth 1 https://github.com/kleber2009-alt/ai-command-center.git "$REPO"; fi

echo "── 3/5 данные и настройки"
mkdir -p "$DATA" "$WEB"; chmod 700 "$DATA"
[ -f "$DATA/config.json" ] || { echo "положите config.json в $DATA (формат — sample/config.json + ключ sources) и запустите снова"; exit 1; }
printf '%s' "$DATA_KEY" > "$DATA/.data_key"; chmod 600 "$DATA/.data_key"

cat > /usr/local/bin/funnel-analytics-update <<'UPD'
#!/usr/bin/env bash
# git pull → расшифровать данные контента → обновить источники → пересобрать страницу
set -euo pipefail
REPO=/opt/ai-command-center; DATA=/opt/funnel-analytics-data; WEB=/var/www/funnel-analytics
git -C "$REPO" pull -q --ff-only || echo "git pull не удался — собираю на текущем коде"
ENC="$REPO/apps/funnel-analytics/private/content.json.gz.enc"
if [ -f "$ENC" ]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:"$DATA/.data_key" -in "$ENC" | gunzip > "$DATA/content.json.new"
  mv "$DATA/content.json.new" "$DATA/content.json"
fi
[ -f /etc/funnel-analytics.env ] && { set -a; . /etc/funnel-analytics.env; set +a; }
python3 "$REPO/apps/funnel-analytics/update.py" --data "$DATA" --out "$WEB/index.html.tmp"
mv "$WEB/index.html.tmp" "$WEB/index.html"
chmod 644 "$WEB/index.html"
echo "$(date '+%F %T') обновлено"
UPD
chmod +x /usr/local/bin/funnel-analytics-update
[ -f /etc/funnel-analytics.env ] || { printf '# META_TOKEN=\n# GETCOURSE_ACCOUNT=\n# GETCOURSE_KEY=\n' > /etc/funnel-analytics.env; chmod 600 /etc/funnel-analytics.env; }

echo "── 4/5 первая сборка + расписание (каждые 3 часа)"
/usr/local/bin/funnel-analytics-update
echo '23 */3 * * * root /usr/local/bin/funnel-analytics-update >> /var/log/funnel-analytics.log 2>&1' > /etc/cron.d/funnel-analytics
chmod 644 /etc/cron.d/funnel-analytics

echo "── 5/5 веб-сервер для $DOMAIN"
TS=$(date +%Y%m%d_%H%M%S)
caddy_block() {
  CF=/etc/caddy/Caddyfile; touch "$CF"; cp "$CF" "$CF.bak.$TS"
  python3 - "$CF" "$DOMAIN" "$WEB" <<'PY'
import re, sys
cf, domain, web = sys.argv[1:]
s = open(cf).read()
s = re.sub(r"\n?# >>> funnel-analytics.*?# <<< funnel-analytics\n?", "\n", s, flags=re.S)
block = (f"\n# >>> funnel-analytics\n{domain} {{\n\troot * {web}\n\theader Cache-Control \"no-store\"\n"
         f"\theader X-Robots-Tag \"noindex, nofollow\"\n\tfile_server\n}}\n# <<< funnel-analytics\n")
open(cf, "w").write(s.rstrip("\n") + "\n" + block)
PY
  if caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
    systemctl reload caddy || systemctl restart caddy
    echo "Caddy: $DOMAIN подключён (сертификат выпустится сам, когда DNS укажет на этот сервер)"
  else
    cp "$CF.bak.$TS" "$CF"; echo "Caddy: конфиг не прошёл проверку — откатил $CF.bak.$TS, сайт не тронут"; exit 1
  fi
}
if command -v caddy >/dev/null; then
  caddy_block
elif command -v nginx >/dev/null; then
  NG=/etc/nginx/conf.d/funnel-analytics.conf
  [ -f "$NG" ] && cp "$NG" "$NG.bak.$TS"
  cat > "$NG" <<NGX
server {
  listen 80;
  server_name $DOMAIN;
  root $WEB;
  index index.html;
  add_header Cache-Control "no-store";
  add_header X-Robots-Tag "noindex, nofollow";
}
NGX
  if nginx -t >/dev/null 2>&1; then systemctl reload nginx; echo "nginx: $DOMAIN подключён по http"
    if command -v certbot >/dev/null; then certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo "certbot: сертификат не выпущен — проверьте DNS и запустите скрипт ещё раз"
    else echo "для https: apt-get install -y certbot python3-certbot-nginx и запустите скрипт ещё раз"; fi
  else rm -f "$NG"; [ -f "$NG.bak.$TS" ] && mv "$NG.bak.$TS" "$NG"; echo "nginx: конфиг не прошёл проверку — ничего не изменено"; exit 1; fi
elif ss -ltn | grep -qE ':(80|443) '; then
  echo "Порты 80/443 заняты чем-то другим (не Caddy и не nginx) — веб-сервер не трогаю."
  echo "Пришлите вывод: ss -ltnp | grep -E ':80 |:443 '"
else
  if command -v apt-get >/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
    printf '' > /etc/caddy/Caddyfile
    caddy_block
  else echo "Установите Caddy вручную и запустите скрипт ещё раз"; fi
fi

echo
echo "Готово. Страница: $WEB/index.html"
echo "Адрес: https://$DOMAIN  (после записи в Cloudflare: A dashboard → $(curl -s4 https://ifconfig.me || echo IP-сервера), DNS only)"
echo "Лог обновлений: /var/log/funnel-analytics.log"
