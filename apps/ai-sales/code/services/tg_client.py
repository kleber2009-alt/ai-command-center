"""
Telegram Bot API client · реальная отправка/прием.

Поддерживает:
- sendMessage (текст с Markdown)
- sendVoice (OGG voice message)
- sendVideoNote (круглое видео-сообщение)
- sendChatAction (typing/recording indicator)
- sendPhoto, sendDocument
- getFile (скачать file_id входящих сообщений)

Mock-режим логирует но не зовёт API.
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Literal, Optional

log = logging.getLogger("aisales.tg")

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"
BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")

API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else None
FILE_BASE = f"https://api.telegram.org/file/bot{BOT_TOKEN}" if BOT_TOKEN else None


# ============ Send actions ============

async def send_text(
    chat_id: int,
    text: str,
    parse_mode: Optional[Literal["Markdown", "MarkdownV2", "HTML"]] = "Markdown",
    reply_to_message_id: Optional[int] = None,
    disable_preview: bool = True,
) -> dict:
    """Отправить текстовое сообщение."""
    if MOCK_MODE or not API_BASE:
        log.info("[MOCK TG TEXT] → %s: %s", chat_id, text[:80])
        return {"ok": True, "mock": True}

    payload = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": disable_preview,
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_to_message_id:
        payload["reply_to_message_id"] = reply_to_message_id

    return await _post("sendMessage", json=payload)


async def send_voice(
    chat_id: int,
    voice_path: Path,
    caption: Optional[str] = None,
    duration: Optional[int] = None,
) -> dict:
    """
    Отправить голосовое сообщение.
    voice_path должен быть OGG/Opus (см. media.text_to_voice format='ogg').
    """
    if MOCK_MODE or not API_BASE:
        log.info("[MOCK TG VOICE] → %s: %s (caption=%s)", chat_id, voice_path.name, caption)
        return {"ok": True, "mock": True}

    if not voice_path.exists() or voice_path.stat().st_size == 0:
        log.error("voice_path не существует или пустой: %s", voice_path)
        return {"ok": False, "error": "voice file missing"}

    return await _multipart("sendVoice", chat_id=chat_id, file_field="voice",
                            file_path=voice_path,
                            extra={"caption": caption, "duration": duration})


async def send_video_note(
    chat_id: int,
    video_path: Path,
    duration: Optional[int] = None,
    length: int = 480,
) -> dict:
    """
    Отправить кружок (TG video_note).
    Видео должно быть квадратным MP4 (см. wav2lip.audio_to_circle).
    """
    if MOCK_MODE or not API_BASE:
        log.info("[MOCK TG CIRCLE] → %s: %s", chat_id, video_path.name)
        return {"ok": True, "mock": True}

    if not video_path.exists() or video_path.stat().st_size == 0:
        log.error("video_path не существует или пустой: %s", video_path)
        return {"ok": False, "error": "video file missing"}

    return await _multipart("sendVideoNote", chat_id=chat_id, file_field="video_note",
                            file_path=video_path,
                            extra={"duration": duration, "length": length})


async def send_chat_action(
    chat_id: int,
    action: Literal["typing", "record_voice", "upload_voice", "record_video_note", "upload_video_note"],
) -> dict:
    """Показать пользователю что бот «печатает» / «записывает голосовое»."""
    if MOCK_MODE or not API_BASE:
        return {"ok": True, "mock": True}
    return await _post("sendChatAction", json={"chat_id": chat_id, "action": action})


async def send_typing_burst(chat_id: int, duration_s: float) -> None:
    """
    Имитировать живую печать: показывать 'typing' с обновлениями.
    TG показывает индикатор 5 секунд после каждого вызова, так что обновляем.
    """
    elapsed = 0.0
    while elapsed < duration_s:
        await send_chat_action(chat_id, "typing")
        wait = min(4.5, duration_s - elapsed)
        await asyncio.sleep(wait)
        elapsed += wait


# ============ Receive · download file ============

async def get_file_path(file_id: str) -> Optional[str]:
    """getFile → возвращает file_path для скачивания."""
    if MOCK_MODE or not API_BASE:
        return f"mock/{file_id}"
    r = await _post("getFile", json={"file_id": file_id})
    if r.get("ok"):
        return r["result"]["file_path"]
    return None


async def download_file(file_id: str, dst_dir: Path = Path("/tmp")) -> Optional[Path]:
    """Скачать файл (voice, video_note, document) от клиента."""
    file_path = await get_file_path(file_id)
    if not file_path:
        return None

    if MOCK_MODE or not FILE_BASE:
        # Пустой stub-файл
        fake = dst_dir / f"mock-{file_id}.bin"
        fake.write_bytes(b"")
        log.info("[MOCK TG DOWNLOAD] %s → %s", file_id, fake)
        return fake

    try:
        import httpx  # type: ignore
    except ImportError:
        raise RuntimeError("pip install httpx")

    url = f"{FILE_BASE}/{file_path}"
    suffix = Path(file_path).suffix or ".bin"
    dst = dst_dir / f"tg-{file_id}{suffix}"
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(url)
        r.raise_for_status()
        dst.write_bytes(r.content)
    log.info("TG download · %s (%d bytes)", dst.name, dst.stat().st_size)
    return dst


# ============ Webhook setup ============

async def set_webhook(url: str, secret_token: Optional[str] = None) -> dict:
    """Зарегистрировать webhook URL у Telegram. Запускается из CLI/deploy."""
    if MOCK_MODE or not API_BASE:
        return {"ok": True, "mock": True}
    payload = {
        "url": url,
        "max_connections": 40,
        "allowed_updates": ["message", "edited_message", "callback_query"],
    }
    if secret_token:
        payload["secret_token"] = secret_token
    return await _post("setWebhook", json=payload)


async def delete_webhook() -> dict:
    if MOCK_MODE or not API_BASE:
        return {"ok": True, "mock": True}
    return await _post("deleteWebhook", json={"drop_pending_updates": False})


async def get_webhook_info() -> dict:
    if MOCK_MODE or not API_BASE:
        return {"ok": True, "result": {"url": "mock"}, "mock": True}
    return await _post("getWebhookInfo")


# ============ Internals ============

async def _post(method: str, json: Optional[dict] = None) -> dict:
    try:
        import httpx  # type: ignore
    except ImportError:
        raise RuntimeError("pip install httpx")

    url = f"{API_BASE}/{method}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, json=json or {})
        try:
            data = r.json()
        except Exception:
            data = {"ok": False, "status_code": r.status_code, "text": r.text[:200]}
        if not data.get("ok"):
            log.warning("TG %s failed: %s", method, data)
        return data


async def _multipart(
    method: str,
    chat_id: int,
    file_field: str,
    file_path: Path,
    extra: Optional[dict] = None,
) -> dict:
    """POST multipart/form-data для отправки файлов."""
    import httpx  # type: ignore

    url = f"{API_BASE}/{method}"
    files = {file_field: (file_path.name, file_path.read_bytes())}
    data = {"chat_id": str(chat_id)}
    for k, v in (extra or {}).items():
        if v is not None:
            data[k] = str(v)

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(url, files=files, data=data)
        try:
            return r.json()
        except Exception:
            return {"ok": False, "status_code": r.status_code, "text": r.text[:200]}


# ============ Diagnostics ============

def check_setup() -> dict:
    return {
        "bot_token": "set" if BOT_TOKEN else "missing",
        "mock_mode": MOCK_MODE,
        "api_base": API_BASE if BOT_TOKEN else None,
    }


# ============ TgBot — per-tenant client ============

class TgBot:
    """
    Stateless per-token Telegram Bot API client.
    Same interface as module-level functions but uses an explicit token.
    Используется для мультитенантных ботов.
    """

    def __init__(self, token: str):
        self.token = token
        self._api = f"https://api.telegram.org/bot{token}"
        self._file = f"https://api.telegram.org/file/bot{token}"

    async def _post(self, method: str, json: dict | None = None) -> dict:
        import httpx
        url = f"{self._api}/{method}"
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(url, json=json or {})
            try:
                data = r.json()
            except Exception:
                data = {"ok": False, "status_code": r.status_code, "text": r.text[:200]}
            if not data.get("ok"):
                log.warning("TgBot %s · %s failed: %s", self.token[-8:], method, data)
            return data

    async def _multipart(self, method: str, chat_id: int, file_field: str, file_path: "Path", extra: dict | None = None) -> dict:
        import httpx
        url = f"{self._api}/{method}"
        files = {file_field: (file_path.name, file_path.read_bytes())}
        data = {"chat_id": str(chat_id)}
        for k, v in (extra or {}).items():
            if v is not None:
                data[k] = str(v)
        async with httpx.AsyncClient(timeout=120) as c:
            r = await c.post(url, files=files, data=data)
            try:
                return r.json()
            except Exception:
                return {"ok": False, "text": r.text[:200]}

    async def send_text(self, chat_id: int, text: str, parse_mode: str | None = "Markdown", disable_preview: bool = True) -> dict:
        payload: dict = {"chat_id": chat_id, "text": text, "disable_web_page_preview": disable_preview}
        if parse_mode:
            payload["parse_mode"] = parse_mode
        return await self._post("sendMessage", json=payload)

    async def send_voice(self, chat_id: int, voice_path: "Path", duration: int | None = None) -> dict:
        return await self._multipart("sendVoice", chat_id, "voice", voice_path, {"duration": duration})

    async def send_video_note(self, chat_id: int, video_path: "Path", duration: int | None = None) -> dict:
        return await self._multipart("sendVideoNote", chat_id, "video_note", video_path, {"duration": duration, "length": "360"})

    async def send_chat_action(self, chat_id: int, action: str) -> dict:
        return await self._post("sendChatAction", json={"chat_id": chat_id, "action": action})

    async def download_file(self, file_id: str, dst_dir: "Path") -> "Path | None":
        r = await self._post("getFile", json={"file_id": file_id})
        if not r.get("ok"):
            return None
        file_path = r["result"]["file_path"]
        import httpx
        url = f"{self._file}/{file_path}"
        suffix = Path(file_path).suffix or ".bin"
        dst = dst_dir / f"tg-{file_id}{suffix}"
        async with httpx.AsyncClient(timeout=60) as c:
            resp = await c.get(url)
            resp.raise_for_status()
            dst.write_bytes(resp.content)
        return dst

    async def set_webhook(self, url: str, secret: str | None = None) -> dict:
        payload: dict = {"url": url, "max_connections": 40, "allowed_updates": ["message", "edited_message"]}
        if secret:
            payload["secret_token"] = secret
        return await self._post("setWebhook", json=payload)

    async def send_typing_burst(self, chat_id: int, total_s: float) -> None:
        import asyncio
        elapsed = 0.0
        while elapsed < total_s:
            await self.send_chat_action(chat_id, "typing")
            await asyncio.sleep(min(4.5, total_s - elapsed))
            elapsed += 4.5
