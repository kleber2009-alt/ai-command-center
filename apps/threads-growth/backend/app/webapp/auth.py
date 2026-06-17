"""Telegram Mini App авторизация — валидация initData (owner-only).

Мини-аппа отдаётся на публичном сабдомене, поэтому все `/api/*` закрыты
зависимостью `verify_tma`: фронт шлёт заголовок `Authorization: tma <initData>`,
здесь проверяется HMAC-подпись (ключ — TELEGRAM_BOT_TOKEN) и что `user.id`
совпадает с OWNER_TELEGRAM_ID. Док: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

Воркеры/бот ходят в БД напрямую (не по HTTP), так что закрытие HTTP-API их не
затрагивает. Для локальной разработки можно выставить WEBAPP_AUTH_DISABLED=1.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import Header, HTTPException

from app.config import settings

# Окно свежести initData (сек). Telegram-подпись не протухает сама — ограничиваем
# повторное использование старой строки.
MAX_AUTH_AGE = 24 * 60 * 60


def _validate(init_data: str, bot_token: str) -> dict | None:
    """Возвращает разобранный dict initData при валидной подписи, иначе None."""
    try:
        data = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        return None
    received_hash = data.pop("hash", None)
    if not received_hash:
        return None
    check_string = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received_hash):
        return None
    return data


async def verify_tma(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI-зависимость: пускает только владельца из валидного Telegram WebApp."""
    if settings.webapp_auth_disabled:
        return {"id": settings.owner_telegram_id, "dev": True}

    if not settings.telegram_bot_token:
        raise HTTPException(503, "TELEGRAM_BOT_TOKEN не задан — мини-аппа недоступна")
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(401, "нет Telegram init data")

    data = _validate(authorization[4:].strip(), settings.telegram_bot_token)
    if data is None:
        raise HTTPException(401, "невалидная подпись Telegram init data")

    auth_date = int(data.get("auth_date") or 0)
    if MAX_AUTH_AGE and auth_date and (time.time() - auth_date) > MAX_AUTH_AGE:
        raise HTTPException(401, "init data устарела, переоткрой мини-аппу")

    user_raw = data.get("user")
    if not user_raw:
        raise HTTPException(401, "нет user в init data")
    try:
        user = json.loads(user_raw)
    except Exception:
        raise HTTPException(401, "битый user в init data")

    if settings.owner_telegram_id and user.get("id") != settings.owner_telegram_id:
        raise HTTPException(403, "доступ только владельцу")
    return user
