#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/make-admin-auth.sh
# ───────────────────────────────────────────────────────────────────
# Генерирует строку для ADMIN_BASIC_AUTH в .env.
#
# Использование:
#   ./scripts/make-admin-auth.sh admin
#     → попросит пароль, выведет строку для копирования в .env
#
#   ./scripts/make-admin-auth.sh admin 'mySecretPass'
#     → берёт пароль из аргумента (опасно: попадает в shell history)
#
# Требует: openssl (есть в любой ubuntu).
# ═══════════════════════════════════════════════════════════════════

set -eu

USER="${1:-admin}"
PASS="${2:-}"

if [ -z "$PASS" ]; then
  printf "Пароль для пользователя '%s': " "$USER" >&2
  stty -echo
  read PASS
  stty echo
  echo >&2
fi

if [ -z "$PASS" ]; then
  echo "ERROR: пустой пароль" >&2
  exit 1
fi

SALT=$(openssl rand -hex 4)
HASH=$(openssl passwd -apr1 -salt "$SALT" "$PASS")

echo "Добавь в .env:"
echo "ADMIN_BASIC_AUTH='${USER}:${HASH}'"
echo
echo "Несколько пользователей: соединяй \\n"
echo "  ADMIN_BASIC_AUTH='admin:\$apr1\$...\\nilya:\$apr1\$...'"
