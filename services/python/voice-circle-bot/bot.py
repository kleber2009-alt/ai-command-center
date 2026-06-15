#!/usr/bin/env python3
"""
voice-circle-bot — Telegram bot that responds with voice video notes (кружки).
Flow: group message → Claude generates reply → ElevenLabs TTS → ffmpeg mp4 → sendVideoNote
"""

import asyncio
import logging
import os
import subprocess
import tempfile

import anthropic
import httpx
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("voice-circle-bot")

# ── Config ────────────────────────────────────────────────────────────────────

TELEGRAM_TOKEN     = os.environ["TELEGRAM_BOT_TOKEN"]
ANTHROPIC_API_KEY  = os.environ["ANTHROPIC_API_KEY"]
ELEVENLABS_API_KEY = os.environ["ELEVENLABS_API_KEY"]
ELEVENLABS_VOICE_ID = os.environ["ELEVENLABS_VOICE_ID"]

MODEL              = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
OWNER_ID           = int(os.environ.get("OWNER_TELEGRAM_ID", "0"))
MAX_TOKENS         = int(os.environ.get("MAX_RESPONSE_TOKENS", "180"))
ELEVEN_MODEL       = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")

IGNORED_USER_IDS = {
    int(x) for x in os.environ.get("IGNORED_USER_IDS", "").split(",") if x.strip()
}

_raw = os.environ.get("ALLOWED_CHAT_IDS", "")
ALLOWED_CHAT_IDS = {int(x) for x in _raw.split(",") if x.strip()} if _raw.strip() else set()

SYSTEM_PROMPT = os.environ.get(
    "SYSTEM_PROMPT",
    "Ты голосовой ассистент в Telegram-группе. "
    "Отвечай коротко и по делу на русском языке. "
    "Максимум 2–3 предложения — ответ будет озвучен голосом.",
)

claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── LLM ───────────────────────────────────────────────────────────────────────

def generate_response(text: str, author: str = "") -> str:
    user_msg = f"[{author}]: {text}" if author else text
    resp = claude.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    return resp.content[0].text.strip()

# ── ElevenLabs TTS ────────────────────────────────────────────────────────────

async def text_to_mp3(text: str) -> bytes:
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech"
        f"/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128"
    )
    async with httpx.AsyncClient(timeout=40.0) as client:
        r = await client.post(
            url,
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": text,
                "model_id": ELEVEN_MODEL,
                "voice_settings": {
                    "stability": 0.55,
                    "similarity_boost": 0.85,
                    "style": 0.0,
                    "use_speaker_boost": True,
                },
            },
        )
    r.raise_for_status()
    return r.content

# ── ffmpeg: audio → 512×512 mp4 video note ───────────────────────────────────

def mp3_to_video_note(audio_bytes: bytes) -> bytes:
    """Creates a 512×512 mp4 with lime waveform on dark bg. Suitable for sendVideoNote."""
    with tempfile.TemporaryDirectory(prefix="vcb_") as d:
        audio_path = f"{d}/audio.mp3"
        video_path = f"{d}/out.mp4"

        with open(audio_path, "wb") as f:
            f.write(audio_bytes)

        # Dark bg + centered lime waveform
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "color=c=#0d0d0d:s=512x512:r=30",
            "-i", audio_path,
            "-filter_complex",
            (
                "[0:v]scale=512:512[bg];"
                "[1:a]aformat=channel_layouts=mono,"
                "showwaves=s=512x220:mode=cline:rate=30:colors=#c8f060[wave];"
                "[bg][wave]overlay=x=0:y=146[out]"
            ),
            "-map", "[out]", "-map", "1:a",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24",
            "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            "-shortest",
            video_path,
        ]

        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg error (code {result.returncode}): "
                f"{result.stderr.decode(errors='replace')[:600]}"
            )

        with open(video_path, "rb") as f:
            return f.read()

# ── Telegram handler ──────────────────────────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message
    if not msg or not msg.text:
        return

    chat_id   = msg.chat_id
    chat_type = msg.chat.type

    if chat_type not in ("group", "supergroup"):
        return

    if ALLOWED_CHAT_IDS and chat_id not in ALLOWED_CHAT_IDS:
        return

    sender_id = msg.from_user.id if msg.from_user else None
    if sender_id is not None:
        if sender_id == OWNER_ID or sender_id in IGNORED_USER_IDS:
            return

    text = msg.text.strip()
    if not text or text.startswith("/"):
        return

    author = ""
    if msg.from_user:
        author = msg.from_user.username or msg.from_user.first_name or ""

    logger.info("Processing [%s] %r from %s", chat_id, text[:80], author or sender_id)

    try:
        await context.bot.send_chat_action(chat_id=chat_id, action="record_video_note")

        # 1. Generate text response
        reply_text = await asyncio.to_thread(generate_response, text, author)
        logger.info("Reply text: %r", reply_text[:100])

        # 2. TTS → mp3
        await context.bot.send_chat_action(chat_id=chat_id, action="record_video_note")
        audio_bytes = await text_to_mp3(reply_text)

        # 3. mp3 → video note
        video_bytes = await asyncio.to_thread(mp3_to_video_note, audio_bytes)
        logger.info("Video note size: %.1f KB", len(video_bytes) / 1024)

        # 4. Send
        await context.bot.send_video_note(
            chat_id=chat_id,
            video_note=video_bytes,
            reply_to_message_id=msg.message_id,
        )
        logger.info("Sent video note to %s", chat_id)

    except Exception:
        logger.exception("Failed to handle message in chat %s", chat_id)

# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info(
        "voice-circle-bot starting | chats=%s ignored=%s",
        ALLOWED_CHAT_IDS or "all-groups",
        IGNORED_USER_IDS,
    )
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
