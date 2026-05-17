"""
Instagram Graph API · Messenger Platform (через Facebook Business).

IG Direct у Meta объединён с Messenger API. Что доступно:
- sendMessage (текст)
- sendMessage с attachment (image, video, audio)
- Reactions
- Чтение входящих через webhook (сообщения, медиа-attachments)

Ограничения IG (важно знать):
- НЕТ нативного «голосового сообщения» как в TG — отправляем как audio attachment
- НЕТ кружочков — отправляем как обычное video attachment
- Лимит 24 часа на ответ после последнего сообщения клиента (политика Meta)
- Attachments должны быть публично доступными URL (хостить в S3/MinIO)

Mock-режим: логирует, не зовёт API.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Literal, Optional

log = logging.getLogger("aisales.ig")

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"

PAGE_TOKEN = os.getenv("IG_PAGE_TOKEN", "")
API_VERSION = os.getenv("IG_API_VERSION", "v21.0")
API_BASE = f"https://graph.facebook.com/{API_VERSION}"


# ============ Send ============

async def send_text(recipient_id: str, text: str) -> dict:
    """Отправить текстовое сообщение в IG Direct."""
    if MOCK_MODE or not PAGE_TOKEN:
        log.info("[MOCK IG TEXT] → %s: %s", recipient_id, text[:80])
        return {"ok": True, "mock": True}

    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": text},
        "messaging_type": "RESPONSE",
    }
    return await _post("me/messages", json=payload, params={"access_token": PAGE_TOKEN})


async def send_audio(recipient_id: str, audio_url: str) -> dict:
    """
    Отправить аудио (mp3) как attachment.
    audio_url — публично доступный HTTPS URL (S3/MinIO + signed URL).
    """
    if MOCK_MODE or not PAGE_TOKEN:
        log.info("[MOCK IG AUDIO] → %s: %s", recipient_id, audio_url[:60])
        return {"ok": True, "mock": True}

    payload = {
        "recipient": {"id": recipient_id},
        "message": {
            "attachment": {
                "type": "audio",
                "payload": {"url": audio_url, "is_reusable": False},
            }
        },
        "messaging_type": "RESPONSE",
    }
    return await _post("me/messages", json=payload, params={"access_token": PAGE_TOKEN})


async def send_video(recipient_id: str, video_url: str) -> dict:
    """
    Отправить видео как attachment (вместо «кружочка» у TG).
    URL должен быть публично доступен.
    """
    if MOCK_MODE or not PAGE_TOKEN:
        log.info("[MOCK IG VIDEO] → %s: %s", recipient_id, video_url[:60])
        return {"ok": True, "mock": True}

    payload = {
        "recipient": {"id": recipient_id},
        "message": {
            "attachment": {
                "type": "video",
                "payload": {"url": video_url, "is_reusable": False},
            }
        },
        "messaging_type": "RESPONSE",
    }
    return await _post("me/messages", json=payload, params={"access_token": PAGE_TOKEN})


async def send_image(recipient_id: str, image_url: str) -> dict:
    if MOCK_MODE or not PAGE_TOKEN:
        log.info("[MOCK IG IMAGE] → %s: %s", recipient_id, image_url[:60])
        return {"ok": True, "mock": True}
    payload = {
        "recipient": {"id": recipient_id},
        "message": {
            "attachment": {
                "type": "image",
                "payload": {"url": image_url, "is_reusable": False},
            }
        },
        "messaging_type": "RESPONSE",
    }
    return await _post("me/messages", json=payload, params={"access_token": PAGE_TOKEN})


async def send_typing(recipient_id: str, on: bool = True) -> dict:
    """typing_on / typing_off индикатор."""
    if MOCK_MODE or not PAGE_TOKEN:
        return {"ok": True, "mock": True}
    payload = {
        "recipient": {"id": recipient_id},
        "sender_action": "typing_on" if on else "typing_off",
    }
    return await _post("me/messages", json=payload, params={"access_token": PAGE_TOKEN})


# ============ Receive · download attachment ============

async def download_attachment(url: str, dst_dir: Path = Path("/tmp")) -> Optional[Path]:
    """
    Скачать вложение от клиента (audio, image, video).
    URL приходит в webhook payload — это публичный URL CDN от Meta.
    """
    if MOCK_MODE:
        fake = dst_dir / f"mock-ig-{abs(hash(url))}.bin"
        fake.write_bytes(b"")
        log.info("[MOCK IG DOWNLOAD] %s → %s", url[:60], fake)
        return fake

    try:
        import httpx  # type: ignore
    except ImportError:
        raise RuntimeError("pip install httpx")

    suffix = Path(url.split("?")[0]).suffix or ".bin"
    dst = dst_dir / f"ig-{abs(hash(url))}{suffix}"
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(url)
        r.raise_for_status()
        dst.write_bytes(r.content)
    log.info("IG download · %s (%d bytes)", dst.name, dst.stat().st_size)
    return dst


# ============ Internals ============

async def _post(path: str, json: Optional[dict] = None, params: Optional[dict] = None) -> dict:
    try:
        import httpx  # type: ignore
    except ImportError:
        raise RuntimeError("pip install httpx")
    url = f"{API_BASE}/{path}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, json=json, params=params)
        try:
            return r.json()
        except Exception:
            return {"ok": False, "status_code": r.status_code, "text": r.text[:200]}


# ============ Diagnostics ============

def check_setup() -> dict:
    return {
        "page_token": "set" if PAGE_TOKEN else "missing",
        "api_version": API_VERSION,
        "mock_mode": MOCK_MODE,
    }
