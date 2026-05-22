"""
Telegram webhook handler — production-ready.

Pipeline:

    INCOMING (от клиента):
        text          → flow.run_flow → response
        voice         → tg.download → media.voice_to_text → flow → response
        video_note    → tg.download → media.voice_to_text → flow → response
        document      → ack + flag for human

    OUTGOING (ответ):
        action=text    → tg.send_text
        action=voice   → media.text_to_voice → tg.send_voice
        action=circle  → media.text_to_voice → wav2lip.audio_to_circle → tg.send_video_note
        action=escalate → notify_ilya, no client response

Включает имитацию человеческой задержки + typing-indicator.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from pathlib import Path
from typing import Any

try:
    from fastapi import APIRouter, Header, HTTPException, Request, BackgroundTasks
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

from agents import run_flow
from services import tg_client as tg
from services import media, wav2lip

log = logging.getLogger("aisales.tg.webhook")

router = APIRouter(prefix="/webhooks/telegram", tags=["telegram"]) if HAS_FASTAPI else None

WEBHOOK_SECRET = os.getenv("TG_WEBHOOK_SECRET", "")
ILYA_CHAT_ID = int(os.getenv("ILYA_TG_CHAT_ID", "0") or 0)

# Реалистичная задержка ответа — имитация человека
RESPONSE_DELAY_MIN_S = float(os.getenv("RESPONSE_DELAY_MIN_S", "30"))
RESPONSE_DELAY_MAX_S = float(os.getenv("RESPONSE_DELAY_MAX_S", "120"))


# ============ Webhook entry ============

if HAS_FASTAPI and router:

    @router.post("")
    async def receive(
        request: Request,
        background: BackgroundTasks,
        x_telegram_bot_api_secret_token: str = Header(default=""),
    ):
        """Telegram бьёт сюда. Отвечаем 200 моментально, агента запускаем в background."""
        if WEBHOOK_SECRET and x_telegram_bot_api_secret_token != WEBHOOK_SECRET:
            raise HTTPException(status_code=401, detail="Invalid secret token")

        body = await request.body()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return {"ok": False, "error": "invalid json"}

        # Отдаём управление сразу — обработка в фоне (TG ждёт 200 в течение 60 сек)
        background.add_task(handle_update, payload)
        return {"ok": True}


# ============ Pipeline ============

async def handle_update(payload: dict) -> dict:
    """Полная обработка одного TG update."""
    parsed = parse_tg_update(payload)
    if not parsed:
        log.debug("tg · ignored update %s", payload.get("update_id"))
        return {"status": "ignored"}

    chat_id = parsed["chat_id"]
    log.info("tg · receive · chat=%s · type=%s", chat_id, parsed["media_type"])

    # /start
    if parsed["text"].startswith("/start"):
        await tg.send_text(
            chat_id,
            "Привет 👋 Расскажи в двух словах что у тебя сейчас и где хочешь оказаться — подскажу что у меня есть."
        )
        return {"status": "started"}

    # Если voice/video_note — транскрибируем
    transcribed_text = parsed["text"]
    if parsed["media_type"] in ("voice", "circle"):
        file_id = parsed.get("voice_file_id") or parsed.get("video_note_file_id")
        if file_id:
            await tg.send_chat_action(chat_id, "typing")
            try:
                audio_path = await tg.download_file(file_id, Path("/tmp"))
                if audio_path and audio_path.stat().st_size > 0:
                    transcribed_text = await media.voice_to_text(audio_path)
                    log.info("tg · transcribed (%d chars)", len(transcribed_text))
                else:
                    transcribed_text = "[VOICE — не удалось транскрибировать]"
            except Exception as e:
                log.exception("tg · transcribe error: %s", e)
                transcribed_text = f"[VOICE — ошибка транскрипции: {e}]"

    # Запускаем агентский flow
    result = run_flow(
        client_id=f"tg:{chat_id}",
        channel="tg",
        message=transcribed_text,
        raw_payload=parsed["raw"],
    )

    # Эскалация — пингуем Илью, клиенту тишина (или вежливый ack)
    if result.get("needs_escalation"):
        await _notify_ilya_about_escalation(chat_id, parsed, result)
        # Опционально: краткий ack клиенту
        await tg.send_text(chat_id, "Получил. Сейчас отвечу лично — буквально пару минут.")
        return {"status": "escalated", "reason": result.get("escalation_reason")}

    # Имитация живой задержки
    delay = random.uniform(RESPONSE_DELAY_MIN_S, RESPONSE_DELAY_MAX_S)
    log.info("tg · human-like delay %.1fs", delay)

    action = result.get("response_action", "text")
    response_text = result.get("response_text", "")

    # Показываем «печатает...» или «записывает...» в зависимости от action
    if action == "text":
        await tg.send_typing_burst(chat_id, delay)
        await tg.send_text(chat_id, response_text)

    elif action == "voice":
        # Сначала задержка как «думает», потом «записывает голосовое»
        await asyncio.sleep(delay * 0.5)
        await tg.send_chat_action(chat_id, "record_voice")
        try:
            voice_file = await media.text_to_voice(response_text, target_format="ogg")
            target_dur = result.get("media_duration_target_s", 30)
            await tg.send_chat_action(chat_id, "upload_voice")
            await tg.send_voice(chat_id, voice_file, duration=target_dur)
        except Exception as e:
            log.exception("tg · voice generation failed, fallback to text: %s", e)
            await tg.send_text(chat_id, response_text)

    elif action == "circle":
        await asyncio.sleep(delay * 0.4)
        await tg.send_chat_action(chat_id, "record_video_note")
        try:
            voice_file = await media.text_to_voice(response_text, target_format="mp3")
            circle_file = await wav2lip.audio_to_circle(voice_file)
            target_dur = result.get("media_duration_target_s", 30)
            await tg.send_chat_action(chat_id, "upload_video_note")
            await tg.send_video_note(chat_id, circle_file, duration=target_dur)
        except Exception as e:
            log.exception("tg · circle generation failed, fallback to voice: %s", e)
            try:
                voice_file = await media.text_to_voice(response_text, target_format="ogg")
                await tg.send_voice(chat_id, voice_file)
            except Exception:
                await tg.send_text(chat_id, response_text)

    else:
        # Unknown action — fallback на текст
        await tg.send_text(chat_id, response_text)

    return {
        "status": "responded",
        "action": action,
        "action_reason": result.get("action_reason"),
        "stage": result.get("current_stage"),
        "latency_ms": result.get("latency_ms"),
    }


# ============ Parsing ============

def parse_tg_update(payload: dict) -> dict | None:
    """Распарсить TG update payload."""
    message = payload.get("message") or payload.get("edited_message")
    if not message:
        return None
    try:
        chat_id = message["chat"]["id"]
        from_user = message.get("from", {})
        base = {
            "chat_id": chat_id,
            "username": from_user.get("username"),
            "first_name": from_user.get("first_name"),
            "language": from_user.get("language_code"),
            "raw": payload,
        }

        if "text" in message:
            return {**base, "text": message["text"], "media_type": "text"}
        if "voice" in message:
            return {
                **base,
                "text": "",
                "media_type": "voice",
                "voice_file_id": message["voice"]["file_id"],
                "voice_duration": message["voice"]["duration"],
            }
        if "video_note" in message:
            return {
                **base,
                "text": "",
                "media_type": "circle",
                "video_note_file_id": message["video_note"]["file_id"],
                "video_note_duration": message["video_note"].get("duration"),
            }
        if "audio" in message:
            return {
                **base,
                "text": "",
                "media_type": "voice",
                "voice_file_id": message["audio"]["file_id"],
                "voice_duration": message["audio"].get("duration"),
            }
        if "document" in message:
            return {
                **base,
                "text": f"[FILE: {message['document'].get('file_name', '?')}]",
                "media_type": "document",
                "document_file_id": message["document"]["file_id"],
            }
        if "photo" in message:
            # Самое большое разрешение
            photo = message["photo"][-1]
            return {
                **base,
                "text": message.get("caption", "[PHOTO]"),
                "media_type": "photo",
                "photo_file_id": photo["file_id"],
            }
    except (KeyError, IndexError) as e:
        log.warning("tg · parse error: %s · payload=%s", e, str(payload)[:200])
    return None


# ============ Escalation alert to Ilya ============

async def _notify_ilya_about_escalation(client_chat_id: int, parsed: dict, result: dict) -> None:
    """Уведомить Илью через его личный TG (ILYA_TG_CHAT_ID)."""
    if not ILYA_CHAT_ID:
        log.warning("ILYA_TG_CHAT_ID не настроен — эскалация без алерта")
        return

    reason = result.get("escalation_reason", "?")
    urgency = result.get("escalation_urgency", "?")
    user = parsed.get("username") or parsed.get("first_name") or "?"

    text = (
        f"⚠ *Эскалация* · `{urgency}` · `{reason}`\n\n"
        f"От: @{user} (chat_id: `{client_chat_id}`)\n"
        f"Канал: TG\n\n"
        f"Сообщение клиента:\n_{parsed.get('text', '')[:200]}_\n\n"
        f"[открыть в дашборде →](https://soft-longma-b5d4f0.netlify.app/conv)"
    )
    await tg.send_text(ILYA_CHAT_ID, text)
