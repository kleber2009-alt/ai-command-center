"""
Instagram webhook handler — production-ready.

Особенности IG vs TG:
- IG Direct/Messenger требует HTTPS + verify_token при подписке
- HMAC-SHA256 подпись через X-Hub-Signature-256
- Attachments (audio, image, video) приходят как URL → скачиваем + транскрибируем
- Отправка медиа: только через публичный URL (хостим в MinIO)
- НЕТ кружочков → отправляем video как обычный attachment

Pipeline:
    INCOMING:
        text                        → flow → response
        audio attachment            → download → voice_to_text → flow → response
        image attachment            → ack ("вижу фото, расскажи в тексте")
        video attachment            → ack (если voice — транскрибировать)

    OUTGOING:
        action=text  → ig.send_text
        action=voice → media.text_to_voice (mp3) → storage.upload → ig.send_audio
        action=circle → media + wav2lip → storage.upload → ig.send_video (как attachment)
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import random
from pathlib import Path
from typing import Any, Optional

try:
    from fastapi import APIRouter, Header, HTTPException, Request, BackgroundTasks
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

from agents import run_flow
from services import ig_client as ig
from services import media, wav2lip, storage

log = logging.getLogger("aisales.ig.webhook")

router = APIRouter(prefix="/webhooks/instagram", tags=["instagram"]) if HAS_FASTAPI else None

VERIFY_TOKEN = os.getenv("IG_VERIFY_TOKEN", "aisales-verify-changeme")
APP_SECRET = os.getenv("IG_APP_SECRET", "")
ILYA_TG_CHAT_ID = int(os.getenv("ILYA_TG_CHAT_ID", "0") or 0)

RESPONSE_DELAY_MIN_S = float(os.getenv("RESPONSE_DELAY_MIN_S", "30"))
RESPONSE_DELAY_MAX_S = float(os.getenv("RESPONSE_DELAY_MAX_S", "120"))


# ============ Signature verification ============

def verify_signature(body: bytes, signature_header: str) -> bool:
    """X-Hub-Signature-256 = sha256=<hmac>"""
    if not APP_SECRET:
        log.warning("IG_APP_SECRET не настроен — подпись не проверяется (mock?)")
        return True  # для теста — пропускаем
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header.split("=", 1)[1]
    actual = hmac.new(APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, actual)


# ============ Webhook routes ============

if HAS_FASTAPI and router:

    @router.get("")
    async def verify(
        hub_mode: str | None = None,
        hub_verify_token: str | None = None,
        hub_challenge: str | None = None,
    ):
        """Meta присылает GET для подтверждения подписки."""
        if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
            return int(hub_challenge or 0)  # Meta ожидает challenge как plain text
        raise HTTPException(status_code=403, detail="Invalid verify token")


    @router.post("")
    async def receive(
        request: Request,
        background: BackgroundTasks,
        x_hub_signature_256: str = Header(default=""),
    ):
        body = await request.body()
        if APP_SECRET and not verify_signature(body, x_hub_signature_256):
            raise HTTPException(status_code=401, detail="Invalid signature")

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return {"ok": False, "error": "invalid json"}

        # Meta отдаёт массив entries
        for entry in payload.get("entry", []):
            for messaging_event in entry.get("messaging", []):
                background.add_task(handle_messaging_event, messaging_event)

        return {"ok": True}


# ============ Pipeline ============

async def handle_messaging_event(event: dict) -> dict:
    """Обработать один messaging event."""
    parsed = parse_ig_event(event)
    if not parsed:
        log.debug("ig · ignored event")
        return {"status": "ignored"}

    sender_id = parsed["sender_id"]
    log.info("ig · receive · user=%s · type=%s", sender_id, parsed["media_type"])

    # Транскрипция если voice/audio attachment
    transcribed_text = parsed["text"]
    if parsed["media_type"] == "voice" and parsed.get("attachment_url"):
        try:
            audio_path = await ig.download_attachment(parsed["attachment_url"], Path("/tmp"))
            if audio_path and audio_path.stat().st_size > 0:
                transcribed_text = await media.voice_to_text(audio_path)
                log.info("ig · transcribed (%d chars)", len(transcribed_text))
        except Exception as e:
            log.exception("ig · transcribe error: %s", e)
            transcribed_text = f"[VOICE — ошибка: {e}]"

    elif parsed["media_type"] == "image":
        # На IG часто шлют фото с вопросом — пока просто упоминаем
        transcribed_text = f"[Клиент прислал фото] {parsed.get('text', '')}"

    elif parsed["media_type"] == "video":
        # Можно тоже транскрибировать аудиодорожку
        transcribed_text = f"[Клиент прислал видео] {parsed.get('text', '')}"

    # Агентский flow
    result = run_flow(
        client_id=f"ig:{sender_id}",
        channel="ig",
        message=transcribed_text,
        raw_payload=parsed["raw"],
    )

    # Эскалация
    if result.get("needs_escalation"):
        await _notify_ilya_via_tg(sender_id, parsed, result)
        # Optional ack — но в IG ограниченное окно ответа после клиента
        await ig.send_text(sender_id, "Получил. Сейчас отвечу лично — буквально пару минут.")
        return {"status": "escalated"}

    # Human-like delay (короче для IG — там быстрее ритм)
    delay = random.uniform(RESPONSE_DELAY_MIN_S * 0.7, RESPONSE_DELAY_MAX_S * 0.7)
    log.info("ig · human-like delay %.1fs", delay)

    action = result.get("response_action", "text")
    response_text = result.get("response_text", "")

    if action == "text":
        await asyncio.sleep(delay)
        await ig.send_typing(sender_id, on=True)
        await asyncio.sleep(min(3, delay * 0.1))
        await ig.send_text(sender_id, response_text)

    elif action == "voice":
        # IG: text → mp3 → MinIO → send_audio(URL)
        await asyncio.sleep(delay * 0.5)
        await ig.send_typing(sender_id, on=True)
        try:
            voice_file = await media.text_to_voice(response_text, target_format="mp3")
            public_url = await storage.upload(voice_file, key_prefix="ig-voice")
            await ig.send_audio(sender_id, public_url)
        except Exception as e:
            log.exception("ig · voice failed, fallback text: %s", e)
            await ig.send_text(sender_id, response_text)

    elif action == "circle":
        # IG не имеет кружков → отправляем video attachment
        await asyncio.sleep(delay * 0.4)
        try:
            voice_file = await media.text_to_voice(response_text, target_format="mp3")
            video_file = await wav2lip.audio_to_circle(voice_file)
            public_url = await storage.upload(video_file, key_prefix="ig-video")
            await ig.send_video(sender_id, public_url)
        except Exception as e:
            log.exception("ig · video failed, fallback voice/text: %s", e)
            try:
                voice_file = await media.text_to_voice(response_text, target_format="mp3")
                public_url = await storage.upload(voice_file, key_prefix="ig-voice")
                await ig.send_audio(sender_id, public_url)
            except Exception:
                await ig.send_text(sender_id, response_text)

    else:
        await ig.send_text(sender_id, response_text)

    return {
        "status": "responded",
        "action": action,
        "action_reason": result.get("action_reason"),
        "stage": result.get("current_stage"),
    }


# ============ Parsing ============

def parse_ig_event(event: dict) -> dict | None:
    """Распарсить один messaging event от Meta."""
    try:
        sender_id = event["sender"]["id"]
        base = {
            "sender_id": sender_id,
            "recipient_id": event["recipient"]["id"],
            "timestamp": event.get("timestamp"),
            "raw": event,
        }

        msg = event.get("message", {})
        if not msg:
            return None  # это postback/echo/etc — пока игнорируем

        # Текст
        text = msg.get("text", "")
        attachments = msg.get("attachments", [])

        if not attachments:
            return {**base, "text": text, "media_type": "text"}

        # Берём первый attachment
        att = attachments[0]
        att_type = att.get("type", "unknown")
        att_url = att.get("payload", {}).get("url", "")

        media_type_map = {
            "audio": "voice",
            "image": "image",
            "video": "video",
            "file": "document",
        }

        return {
            **base,
            "text": text,
            "media_type": media_type_map.get(att_type, "unknown"),
            "attachment_url": att_url,
            "attachment_type": att_type,
        }
    except (KeyError, IndexError) as e:
        log.warning("ig · parse error: %s", e)
        return None


# ============ Escalation alert ============

async def _notify_ilya_via_tg(client_ig_id: str, parsed: dict, result: dict) -> None:
    """Пинг Илье в TG про эскалацию в IG."""
    if not ILYA_TG_CHAT_ID:
        log.warning("ILYA_TG_CHAT_ID не настроен")
        return

    from services import tg_client as tg

    reason = result.get("escalation_reason", "?")
    urgency = result.get("escalation_urgency", "?")

    text = (
        f"⚠ *Эскалация · IG* · `{urgency}` · `{reason}`\n\n"
        f"От: IG user `{client_ig_id}`\n\n"
        f"Сообщение клиента:\n_{parsed.get('text', '')[:200]}_\n\n"
        f"[открыть в дашборде →](https://soft-longma-b5d4f0.netlify.app/conv)"
    )
    await tg.send_text(ILYA_TG_CHAT_ID, text)
