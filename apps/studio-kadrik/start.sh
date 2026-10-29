#!/bin/bash
# Запуск @studio_kadrik_bot:  ./start.sh   (лог — bot.log)
# PY — интерпретатор: на Mac своё окружение venv/, на сервере — окружение productionskill-bot (те же aiogram и dotenv).
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "нет .env"; exit 1; }
PY="${PY:-venv/bin/python}"
exec "$PY" bot.py
