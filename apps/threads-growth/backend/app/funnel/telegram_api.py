"""Синхронный клиент Telegram Bot API для воронки (httpx).

Им пользуются и кроны (генерация в 07:00 шлёт карточки), и обработчики бота
(через asyncio.to_thread): sendMessage работает независимо от polling-процесса.
Сообщения уходят в тему «Threads» форум-группы (FUNNEL_CHAT_ID + FUNNEL_TOPIC_ID),
а если группа не задана — владельцу в личку.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from app.config import settings

API = "https://api.telegram.org"


class TelegramError(RuntimeError):
    pass


@dataclass
class Target:
    chat_id: int
    topic_id: int | None = None


def funnel_target() -> Target:
    if settings.funnel_chat_id:
        return Target(settings.funnel_chat_id, settings.funnel_topic_id or None)
    if settings.owner_telegram_id:
        return Target(settings.owner_telegram_id, None)
    raise TelegramError("Не заданы FUNNEL_CHAT_ID / OWNER_TELEGRAM_ID — некуда слать карточки.")


def _call(method: str, payload: dict | None = None, files: dict | None = None, timeout: float = 30.0) -> dict:
    if not settings.telegram_bot_token:
        raise TelegramError("TELEGRAM_BOT_TOKEN не задан.")
    import httpx

    url = f"{API}/bot{settings.telegram_bot_token}/{method}"
    data = {k: v for k, v in (payload or {}).items() if v is not None}
    if files:
        # multipart: вложенные объекты Bot API передаются JSON-строками
        form = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) for k, v in data.items()}
        r = httpx.post(url, data=form, files=files, timeout=timeout)
    else:
        r = httpx.post(url, json=data, timeout=timeout)
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if not body.get("ok"):
        raise TelegramError(f"{method}: {body.get('description') or r.text[:300]}")
    return body["result"]


def send_message(target: Target, text: str, reply_markup: dict | None = None, *,
                 reply_to: int | None = None, html: bool = True) -> dict:
    return _call("sendMessage", {
        "chat_id": target.chat_id,
        "message_thread_id": target.topic_id,
        "text": text,
        "parse_mode": "HTML" if html else None,
        "reply_markup": reply_markup,
        "link_preview_options": {"is_disabled": True},
        "reply_parameters": {"message_id": reply_to, "allow_sending_without_reply": True} if reply_to else None,
    })


def send_messages(target: Target, texts: list[str], reply_markup: dict | None = None,
                  html: bool = True) -> list[int]:
    """Серия сообщений; кнопки — у последнего. Возвращает message_id по порядку."""
    ids: list[int] = []
    for i, text in enumerate(texts):
        markup = reply_markup if i == len(texts) - 1 else None
        ids.append(send_message(target, text, markup, html=html)["message_id"])
    return ids


def edit_reply_markup(chat_id: int, message_id: int, reply_markup: dict | None) -> None:
    try:
        _call("editMessageReplyMarkup", {"chat_id": chat_id, "message_id": message_id,
                                         "reply_markup": reply_markup or {"inline_keyboard": []}})
    except TelegramError as e:
        if "message is not modified" not in str(e):
            raise


def edit_message_text(chat_id: int, message_id: int, text: str, reply_markup: dict | None = None) -> None:
    try:
        _call("editMessageText", {"chat_id": chat_id, "message_id": message_id, "text": text,
                                  "parse_mode": "HTML", "reply_markup": reply_markup,
                                  "link_preview_options": {"is_disabled": True}})
    except TelegramError as e:
        if "message is not modified" not in str(e):
            raise


def send_photo_group(target: Target, file_ids: list[str], caption: str | None = None) -> None:
    media = [{"type": "photo", "media": fid} for fid in file_ids[:10]]
    if caption and media:
        media[0]["caption"] = caption
    if len(media) == 1:
        _call("sendPhoto", {"chat_id": target.chat_id, "message_thread_id": target.topic_id,
                            "photo": media[0]["media"], "caption": caption})
    elif media:
        _call("sendMediaGroup", {"chat_id": target.chat_id, "message_thread_id": target.topic_id, "media": media})


def get_file_bytes(file_id: str) -> tuple[bytes, str]:
    """Скачивает файл, присланный боту (фото/голос). Возвращает (bytes, file_path)."""
    import httpx

    info = _call("getFile", {"file_id": file_id})
    path = info["file_path"]
    r = httpx.get(f"{API}/file/bot{settings.telegram_bot_token}/{path}", timeout=60.0)
    r.raise_for_status()
    return r.content, path


# ── Канал ────────────────────────────────────────────────────────────────────
def create_invite_link(channel_id: int, name: str) -> str:
    """Своя ссылка-приглашение под ветку: по ней бот считает вступления."""
    res = _call("createChatInviteLink", {"chat_id": channel_id, "name": name[:32]})
    return res["invite_link"]


def post_to_channel(channel_id: int, text: str) -> int:
    res = _call("sendMessage", {"chat_id": channel_id, "text": text,
                                "link_preview_options": {"is_disabled": True}})
    return res["message_id"]


def pin_in_channel(channel_id: int, message_id: int) -> None:
    _call("pinChatMessage", {"chat_id": channel_id, "message_id": message_id, "disable_notification": True})


def channel_post_url(channel_id: int, message_id: int, username: str = "") -> str:
    """Публичный канал: t.me/<username>/<id>. Закрытый: t.me/c/<id>/<msg> (открывается
    только участникам — в ветку такую ссылку не ставим)."""
    if username:
        return f"https://t.me/{username.lstrip('@')}/{message_id}"
    internal = str(abs(channel_id))
    if internal.startswith("100"):
        internal = internal[3:]
    return f"https://t.me/c/{internal}/{message_id}"


def link_is_live(url: str) -> bool | None:
    """t.me отдаёт страницу и для мёртвых ссылок, поэтому смотрим на содержимое.
    None — не удалось проверить (сеть)."""
    if not url:
        return False
    try:
        import httpx

        r = httpx.get(url, timeout=10.0, follow_redirects=True)
    except Exception:  # noqa: BLE001
        return None
    if r.status_code != 200:
        return False
    page = r.text
    if "tgme_page_title" in page or "tgme_widget_message" in page or "tgme_channel_info" in page:
        return True
    return False
