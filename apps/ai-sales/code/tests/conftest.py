"""Pytest config · применяется ко всем тестам."""
from __future__ import annotations

import os

# Перед импортом любого модуля — выключаем human-like delays
os.environ.setdefault("AISALES_MOCK", "1")
os.environ.setdefault("RESPONSE_DELAY_MIN_S", "0")
os.environ.setdefault("RESPONSE_DELAY_MAX_S", "0.01")
