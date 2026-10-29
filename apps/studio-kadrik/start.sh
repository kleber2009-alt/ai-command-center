#!/bin/bash
# Запуск @studio_kadrik_bot:  ./start.sh   (лог — bot.log)
# PY — интерпретатор: по умолчанию своё окружение venv/ (на сервере его создаёт deploy/retire_productionskill.sh).
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "нет .env"; exit 1; }
PY="${PY:-venv/bin/python}"
exec "$PY" bot.py
