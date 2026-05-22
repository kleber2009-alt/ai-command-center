#!/usr/bin/env bash
# Регистрация Telegram webhook
#
# Запуск:
#   chmod +x setup_tg_webhook.sh
#   ./setup_tg_webhook.sh <BOT_TOKEN> <WEBHOOK_URL>
#
# Пример:
#   ./setup_tg_webhook.sh "123:ABCdef..." "https://api.46-62-215-11.nip.io/webhooks/telegram"

set -euo pipefail

BOT_TOKEN="${1:-}"
WEBHOOK_URL="${2:-}"
SECRET="${TG_WEBHOOK_SECRET:-}"

if [[ -z "$BOT_TOKEN" || -z "$WEBHOOK_URL" ]]; then
    cat <<EOF
Usage: $0 <BOT_TOKEN> <WEBHOOK_URL>

  BOT_TOKEN     — токен от @BotFather (формат: 123:ABC...)
  WEBHOOK_URL   — HTTPS endpoint вашего api (формат: https://api.domain/webhooks/telegram)
  TG_WEBHOOK_SECRET — env-var с секретом (опционально, рекомендуется)

После регистрации Telegram будет POSTить обновления на WEBHOOK_URL.

EOF
    exit 1
fi

echo "→ Проверяем токен..."
BOT_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe")
echo "$BOT_INFO" | python3 -m json.tool

if ! echo "$BOT_INFO" | grep -q '"ok": *true'; then
    echo "✕ Токен невалиден"
    exit 1
fi

BOT_USERNAME=$(echo "$BOT_INFO" | python3 -c "import sys, json; print(json.load(sys.stdin)['result']['username'])")
echo "✓ Bot: @${BOT_USERNAME}"

echo ""
echo "→ Удаляем старый webhook если был..."
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook" > /dev/null
echo "✓ Очищено"

echo ""
echo "→ Регистрируем webhook: ${WEBHOOK_URL}"

PAYLOAD=$(python3 -c "
import json
data = {
    'url': '${WEBHOOK_URL}',
    'max_connections': 40,
    'allowed_updates': ['message', 'edited_message', 'callback_query'],
}
if '${SECRET}':
    data['secret_token'] = '${SECRET}'
print(json.dumps(data))
")

RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

echo "$RESPONSE" | python3 -m json.tool

if echo "$RESPONSE" | grep -q '"ok": *true'; then
    echo ""
    echo "✓ WEBHOOK ЗАРЕГИСТРИРОВАН"
    echo ""
    echo "Проверь статус:"
    echo "  curl -s 'https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo' | python3 -m json.tool"
    echo ""
    echo "Напиши @${BOT_USERNAME} в Telegram — должен ответить!"
else
    echo ""
    echo "✕ Регистрация не удалась"
    exit 1
fi
