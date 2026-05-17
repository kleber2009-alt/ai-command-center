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
from datetime import datetime
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

# ============ Owner-only режимы (через /tmp флаги) ============

VOICE_INPUT_DIR = Path(os.getenv("VOICE_INPUT_DIR", "/voice-input"))
VOICE_AUDIO_DIR = VOICE_INPUT_DIR / "audio"
VOICE_TRANSCRIPTS_DIR = VOICE_INPUT_DIR / "transcripts"
TEACHING_FLAG = Path("/tmp/aisales-teaching-mode")
VOICE_FORCE_FLAG = Path("/tmp/aisales-voice-force")


def _is_owner(chat_id: int) -> bool:
    return ILYA_CHAT_ID and chat_id == ILYA_CHAT_ID


def _is_teaching() -> bool:
    return TEACHING_FLAG.exists()


def _is_voice_forced() -> bool:
    return VOICE_FORCE_FLAG.exists()


def _voice_count() -> int:
    if not VOICE_AUDIO_DIR.exists():
        return 0
    return sum(1 for _ in VOICE_AUDIO_DIR.glob("*") if _.is_file())


async def _handle_owner_command(chat_id: int, text: str) -> bool:
    """Обработать команду от Ильи. Возвращает True если команда обработана."""
    cmd = text.strip().lower()

    if cmd == "/me":
        await tg.send_text(chat_id, (
            f"`chat_id`: {chat_id}\n"
            f"`is_owner`: True\n"
            f"`teaching`: {_is_teaching()}\n"
            f"`voice_force`: {_is_voice_forced()}\n"
            f"`voice_count`: {_voice_count()}"
        ))
        return True

    if cmd == "/help":
        await tg.send_text(chat_id, (
            "*Команды владельца*\n\n"
            "`/me` — мой chat_id и статусы\n"
            "`/teach on` — все мои voice/text идут в копилку обучения, агент не отвечает\n"
            "`/teach off` — обычный режим, агент общается со мной как с клиентом\n"
            "`/voice on` — форсить ответы голосом (нужен ElevenLabs)\n"
            "`/voice off` — только текст\n"
            "`/profile` — что в копилке обучения\n"
            "`/analyze` — прогнать voice_analyzer прямо сейчас\n"
            "`/reload_prompts` — перечитать agent-prompts/ файлы"
        ))
        return True

    if cmd == "/teach on":
        TEACHING_FLAG.touch()
        VOICE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        VOICE_TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
        await tg.send_text(chat_id, (
            "✓ *Teaching mode ON*\n\n"
            "Шли мне голосовые / кружочки / текстовые сообщения — "
            "буду сохранять как образцы стиля.\n\n"
            "Каждые 5 голосовых автоматически прогоню voice\\_analyzer "
            "и обновлю промпт.\n\n"
            "Чтобы выключить: /teach off"
        ))
        return True

    if cmd == "/teach off":
        TEACHING_FLAG.unlink(missing_ok=True)
        await tg.send_text(chat_id, "✓ *Teaching mode OFF*. Снова отвечаю как обычно.")
        return True

    if cmd == "/voice on":
        VOICE_FORCE_FLAG.touch()
        await tg.send_text(chat_id, "✓ *Voice forced ON*. Буду отвечать голосом.")
        return True

    if cmd == "/voice off":
        VOICE_FORCE_FLAG.unlink(missing_ok=True)
        await tg.send_text(chat_id, "✓ *Voice forced OFF*. Только текст.")
        return True

    if cmd == "/profile":
        count = _voice_count()
        transcripts = list(VOICE_TRANSCRIPTS_DIR.glob("*.txt")) if VOICE_TRANSCRIPTS_DIR.exists() else []
        total_chars = sum(p.stat().st_size for p in transcripts)
        profile_json = VOICE_INPUT_DIR / "analysis" / "voice-profile.json"
        has_profile = profile_json.exists()
        await tg.send_text(chat_id, (
            f"*Voice profile status*\n\n"
            f"Аудио в копилке: *{count}*\n"
            f"Транскриптов: *{len(transcripts)}* ({total_chars} символов)\n"
            f"Voice profile JSON: *{'есть' if has_profile else 'нет'}*\n\n"
            f"Запусти /analyze когда наберётся 3-5 голосовых."
        ))
        return True

    if cmd == "/analyze":
        await tg.send_text(chat_id, "🤖 Запускаю voice_analyzer в фоне... (~30 секунд)")
        asyncio.create_task(_run_voice_analyzer(chat_id))
        return True

    if cmd == "/reload_prompts":
        # Перечитать промпты — модули кэшируют их при импорте, нужен restart.
        # Но мы попробуем перечитать через importlib.
        try:
            from agents import prompts_loader
            import importlib
            importlib.reload(prompts_loader)
            await tg.send_text(chat_id, "✓ Промпты перечитаны (или будут на следующем запросе).")
        except Exception as e:
            await tg.send_text(chat_id, f"⚠ Не удалось: {e}")
        return True

    return False  # не команда


async def _save_voice_sample(parsed: dict, audio_path: Path) -> None:
    """Сохранить голосовое в копилку + транскрибировать."""
    if not audio_path or not audio_path.exists():
        return

    # Перенос в постоянное место с осмысленным именем
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    dst = VOICE_AUDIO_DIR / f"sample-{timestamp}{audio_path.suffix}"
    audio_path.rename(dst)
    log.info("teaching · saved voice sample %s", dst.name)

    # Транскрибируем
    try:
        transcript = await media.voice_to_text(dst)
        transcript_path = VOICE_TRANSCRIPTS_DIR / f"sample-{timestamp}.txt"
        transcript_path.write_text(transcript, encoding="utf-8")
        log.info("teaching · transcribed (%d chars) → %s", len(transcript), transcript_path.name)
        return transcript
    except Exception as e:
        log.exception("teaching · transcribe failed: %s", e)
        return None


async def _run_voice_analyzer(chat_id: int) -> None:
    """Запустить voice_analyzer в фоне и уведомить."""
    import subprocess
    try:
        result = subprocess.run(
            ["python", "-m", "utils.voice_analyzer"],
            cwd="/app",
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            # Парсим последние строки чтобы извлечь summary
            tail = "\n".join(result.stdout.strip().split("\n")[-10:])
            await tg.send_text(chat_id, f"✓ Voice analyzer завершён:\n```\n{tail}\n```")
        else:
            err = result.stderr[-300:] if result.stderr else "?"
            await tg.send_text(chat_id, f"⚠ Voice analyzer упал:\n```\n{err}\n```")
    except subprocess.TimeoutExpired:
        await tg.send_text(chat_id, "⚠ Voice analyzer таймаут (120с)")
    except Exception as e:
        await tg.send_text(chat_id, f"⚠ Не удалось запустить: {e}")


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
    log.info("tg · receive · chat=%s · type=%s · owner=%s · teaching=%s",
             chat_id, parsed["media_type"], _is_owner(chat_id), _is_teaching())

    # ============ Owner-only команды ============
    if _is_owner(chat_id) and parsed["text"].startswith("/"):
        handled = await _handle_owner_command(chat_id, parsed["text"])
        if handled:
            return {"status": "owner_command", "cmd": parsed["text"]}

    # ============ Teaching mode для владельца ============
    if _is_owner(chat_id) and _is_teaching():
        # Сохраняем voice/circle как образцы
        if parsed["media_type"] in ("voice", "circle"):
            file_id = parsed.get("voice_file_id") or parsed.get("video_note_file_id")
            if file_id:
                tmp_path = await tg.download_file(file_id, Path("/tmp"))
                transcript = await _save_voice_sample(parsed, tmp_path)
                count = _voice_count()
                preview = (transcript[:140] + "...") if transcript and len(transcript) > 140 else (transcript or "[не транскрибировано]")
                await tg.send_text(chat_id, (
                    f"✓ Voice sample #{count} сохранён\n\n"
                    f"_{preview}_\n\n"
                    + ("🤖 Прогоняю voice\\_analyzer..." if count > 0 and count % 5 == 0 else "")
                ))
                # Авто-запуск analyzer каждые 5
                if count > 0 and count % 5 == 0:
                    asyncio.create_task(_run_voice_analyzer(chat_id))
                return {"status": "teaching_voice_saved", "count": count}

        # Текстовые сообщения в teaching mode — сохраняем как пример переписки
        if parsed["media_type"] == "text" and not parsed["text"].startswith("/"):
            timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
            VOICE_TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
            sample_path = VOICE_TRANSCRIPTS_DIR / f"text-sample-{timestamp}.txt"
            sample_path.write_text(parsed["text"], encoding="utf-8")
            await tg.send_text(chat_id, (
                f"✓ Text sample сохранён ({len(parsed['text'])} символов)\n"
                f"`{sample_path.name}`"
            ))
            return {"status": "teaching_text_saved"}

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
