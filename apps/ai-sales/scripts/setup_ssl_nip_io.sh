#!/usr/bin/env bash
# Настройка HTTPS через nip.io (бесплатный wildcard DNS) + Caddy reverse proxy.
#
# nip.io работает так: 46.62.215.11.nip.io → автоматически резолвится в 46.62.215.11.
# Никакого DNS-настройки не нужно. Идеально для теста.
#
# Caddy автоматически берёт SSL-сертификат от Let's Encrypt.
#
# После этого скрипта:
#   - api.46-62-215-11.nip.io   → HTTPS на твой aisales-api-v2 (порт 8001)
#   - dashboard.46-62-215-11... → HTTPS на статику (если поставишь)
#
# Запуск на сервере:
#   chmod +x setup_ssl_nip_io.sh
#   ./setup_ssl_nip_io.sh

set -euo pipefail

IP=$(curl -s https://api.ipify.org)
IP_DASH="${IP//./-}"
DOMAIN_DASH="${IP_DASH}.nip.io"
DOMAIN_DOT="${IP}.nip.io"
# Backwards-compat: keep $DOMAIN as the dashed form (it's used below in echos).
DOMAIN="$DOMAIN_DASH"

echo "════════════════════════════════════════════════════════"
echo "SSL setup via nip.io"
echo "  IP:      $IP"
echo "  Hosts:   api.${DOMAIN_DASH}"
echo "           ${DOMAIN_DASH}"
echo "           ${DOMAIN_DOT}"
echo "════════════════════════════════════════════════════════"
echo ""

# 1. Проверка что порты 80 и 443 свободны
echo "→ Проверяем порты 80 и 443..."
if sudo ss -tlnp 2>/dev/null | grep -E ':(80|443) '; then
    echo "⚠ Порты заняты. Освободи их перед запуском Caddy."
    echo "  Если там nginx — sudo systemctl stop nginx"
    exit 1
fi
echo "✓ Порты свободны"

# 2. Установка Caddy
if ! command -v caddy &> /dev/null; then
    echo ""
    echo "→ Устанавливаем Caddy..."
    sudo apt update -qq
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update -qq
    sudo apt install -y caddy
    echo "✓ Caddy установлен"
else
    echo "✓ Caddy уже есть"
fi

# 3. Конфигурация Caddy
echo ""
echo "→ Создаём Caddyfile..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
# AI Sales · auto SSL через Let's Encrypt + nip.io
#
# Serve the same backend on all three nip.io variants of this IP so that
# any reasonable URL guess (apex/dashed/dotted, with or without "api.")
# works. nip.io is on the Public Suffix List, so each FQDN is treated as
# its own registered domain by Let's Encrypt — no shared rate limit.

api.${DOMAIN_DASH}, ${DOMAIN_DASH}, ${DOMAIN_DOT} {
    reverse_proxy 127.0.0.1:8001

    # Логи
    log {
        output file /var/log/caddy/api.log
        format console
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=63072000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}
EOF
echo "✓ Caddyfile создан"

# 4. Запуск
echo ""
echo "→ Перезапускаем Caddy..."
sudo systemctl enable caddy
sudo systemctl restart caddy
sleep 3

# 5. Проверка
echo ""
echo "→ Проверяем статус..."
sudo systemctl status caddy --no-pager | head -10

echo ""
echo "→ Проверяем HTTPS endpoints..."
sleep 5  # дать Caddy время получить сертификат от Let's Encrypt

probe() {
    local host="$1"
    local body
    body=$(curl -sk --max-time 10 "https://${host}/health" || echo "FAIL")
    if [[ "$body" == *"healthy"* ]]; then
        echo "  ✓ https://${host}/health"
    else
        echo "  ⚠ https://${host}/health → $body"
    fi
}

probe "api.${DOMAIN_DASH}"
probe "${DOMAIN_DASH}"
probe "${DOMAIN_DOT}"

echo ""
echo "════════════════════════════════════════════════════════"
echo "Setup complete. Canonical API URL:"
echo "  https://api.${DOMAIN_DASH}"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Endpoints:"
echo "  https://api.${DOMAIN_DASH}/health"
echo "  https://api.${DOMAIN_DASH}/docs"
echo "  https://api.${DOMAIN_DASH}/webhooks/telegram"
echo ""
echo "Aliases (same backend, separate certs):"
echo "  https://${DOMAIN_DASH}/"
echo "  https://${DOMAIN_DOT}/"
echo ""
echo "Используй webhook URL в TG bot setup:"
echo "  bash setup_tg_webhook.sh \$BOT_TOKEN https://api.${DOMAIN_DASH}/webhooks/telegram"
echo ""
echo "Если какой-то endpoint не отвечает — сертификат ещё получается."
echo "Подожди 30 секунд и проверь снова. Логи: sudo journalctl -u caddy -n 50"
