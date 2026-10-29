"""Подключить аккаунт Threads для автопубликации (этап 2).

    docker compose run --rm api python -m app.funnel.connect

Спрашивает токен из приложения Meta (короткий или уже 60-дневный) и секрет
приложения. Короткий токен меняет на 60-дневный (th_exchange_token), находит
ID и ник аккаунта (/me), проверяет права и сохраняет аккаунт с зашифрованным
токеном. Дальше токен продлевает задача `token` раз в неделю.
"""
from __future__ import annotations

import getpass
import sys

from app.config import settings

HOST = "https://graph.threads.net"


def _get(path: str, params: dict) -> dict:
    import httpx

    r = httpx.get(f"{HOST}{path}", params=params, timeout=30.0)
    body = r.json() if r.content else {}
    if r.status_code >= 400 or "error" in body:
        raise SystemExit(f"Threads API: {(body.get('error') or {}).get('message') or r.text[:300]}")
    return body


def exchange(short_token: str, app_secret: str) -> tuple[str, int]:
    body = _get("/access_token", {"grant_type": "th_exchange_token", "client_secret": app_secret,
                                  "access_token": short_token})
    return body["access_token"], int(body.get("expires_in", 0) or 0)


def me(token: str) -> dict:
    return _get("/v1.0/me", {"fields": "id,username", "access_token": token})


def save(handle: str, user_id: str, token: str) -> int:
    from sqlalchemy import select

    from app.core.database import session_scope
    from app.core.security import encrypt_token
    from app.models.account import Account
    from app.services.warmup_service import caps_for_day

    with session_scope() as db:
        acc = db.scalar(select(Account).where(Account.threads_user_id == user_id)) \
            or db.scalar(select(Account).where(Account.handle == handle))
        if acc is None:
            posts, replies = caps_for_day(1)
            acc = Account(handle=handle, status="active", warmup_day=1, daily_post_cap=posts, daily_reply_cap=replies)
            db.add(acc)
        acc.handle, acc.threads_user_id, acc.access_token = handle, user_id, encrypt_token(token)
        acc.status = "active"
        db.flush()
        return acc.id


def _clean(value: str) -> str:
    return value.strip().strip('"\'').replace(" ", "").replace("\n", "")


def main() -> None:
    if not settings.token_encryption_key:
        raise SystemExit("TOKEN_ENCRYPTION_KEY не задан в .env.")
    token = _clean(getpass.getpass("Токен Threads из приложения Meta (ввод скрыт): "))
    if not token:
        raise SystemExit("Пустой токен.")
    print(f"Токен: {token[:4]}…{token[-4:]}, длина {len(token)}")
    if not token.startswith("TH"):
        raise SystemExit("Это не токен Threads: он должен начинаться на THAA. Возьмите его в приложении Meta: "
                         "Use cases → Access the Threads API → Settings → User Token Generator → Generate Access Token.")
    try:
        info = me(token)
    except SystemExit as e:
        raise SystemExit(f"{e}\nТокен не принят. Сгенерируйте новый (старый мог отозваться при повторной генерации) "
                         "и вставьте его целиком, одной строкой.") from None
    secret = _clean(getpass.getpass("Секрет приложения (App secret; Enter — пропустить): "))
    days = None
    if secret:
        try:
            token, expires = exchange(token, secret)
            days = round(expires / 86400)
        except SystemExit as e:
            print(f"Обмен на 60-дневный не нужен или не удался ({e}) — сохраняю токен как есть.")
    acc_id = save(info["username"], info["id"], token)
    print(f"Готово: @{info['username']} (id {info['id']}) подключён как аккаунт №{acc_id}."
          + (f" Токен действует {days} дн., продлевается сам." if days else ""))
    if settings.funnel_account_id and settings.funnel_account_id != acc_id:
        print(f"Внимание: в .env FUNNEL_ACCOUNT_ID={settings.funnel_account_id} — поставьте {acc_id} или 0.")


if __name__ == "__main__":
    sys.exit(main())
