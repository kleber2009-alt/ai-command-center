#!/bin/sh
# ═══════════════════════════════════════════════════════════════════
# deploy/nginx-entrypoint.sh
# ───────────────────────────────────────────────────────────────────
# Рендерит /etc/nginx/auth/htpasswd из переменной ADMIN_BASIC_AUTH
# перед стартом nginx. Формат ADMIN_BASIC_AUTH — обычный htpasswd:
#
#   ADMIN_BASIC_AUTH='admin:$apr1$abc...:$XYZ'
#
# или несколько строк через \n:
#
#   ADMIN_BASIC_AUTH='admin:$apr1$...\nilya:$apr1$...'
#
# Сгенерировать строку: `htpasswd -nB admin` (apache2-utils) или
# `openssl passwd -apr1 -salt $(openssl rand -hex 4) PASSWORD`.
#
# Если переменная пустая — auth остаётся выключенным (файл htpasswd
# создаётся с заглушкой, и nginx будет отвечать 401 на /admin /board).
# ═══════════════════════════════════════════════════════════════════

set -eu

mkdir -p /etc/nginx/auth

if [ -n "${ADMIN_BASIC_AUTH:-}" ]; then
  # \n в env-строке заменяем на реальный перевод строки.
  printf '%b\n' "$ADMIN_BASIC_AUTH" > /etc/nginx/auth/htpasswd
  chmod 600 /etc/nginx/auth/htpasswd
  echo "[nginx-entrypoint] ADMIN_BASIC_AUTH loaded ($(wc -l < /etc/nginx/auth/htpasswd) users)"
else
  # Заглушка: нет валидных пользователей → 401 на всё что под auth_basic.
  echo 'disabled:!' > /etc/nginx/auth/htpasswd
  chmod 600 /etc/nginx/auth/htpasswd
  echo "[nginx-entrypoint] ADMIN_BASIC_AUTH not set — /admin и /board вернут 401"
fi

exec nginx -g 'daemon off;'
