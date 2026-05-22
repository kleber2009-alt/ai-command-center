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
DOMAIN="${IP_DASH}.nip.io"

echo "════════════════════════════════════════════════════════"
echo "SSL setup via nip.io"
echo "  IP:      $IP"
echo "  Domain:  api.${DOMAIN}"
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

api.${DOMAIN} {
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
echo "→ Проверяем HTTPS endpoint..."
sleep 5  # дать Caddy время получить сертификат от Let's Encrypt
HTTPS_TEST=$(curl -sk "https://api.${DOMAIN}/health" || echo "FAIL")
echo "Response: $HTTPS_TEST"

if [[ "$HTTPS_TEST" == *"healthy"* ]]; then
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "✓ HTTPS РАБОТАЕТ"
    echo "════════════════════════════════════════════════════════"
    echo ""
    echo "Endpoints:"
    echo "  https://api.${DOMAIN}/health"
    echo "  https://api.${DOMAIN}/docs"
    echo "  https://api.${DOMAIN}/webhooks/telegram"
    echo ""
    echo "Используй webhook URL в TG bot setup:"
    echo "  bash setup_tg_webhook.sh \$BOT_TOKEN https://api.${DOMAIN}/webhooks/telegram"
else
    echo ""
    echo "⚠ HTTPS пока не отвечает (возможно сертификат ещё получается)"
    echo "Подожди 30 секунд и попробуй: curl https://api.${DOMAIN}/health"
    echo ""
    echo "Если не работает — посмотри логи: sudo journalctl -u caddy -n 50"
fi
