"""
Media pipeline · text → speech → audio file ready for TG/IG.

Использует ElevenLabs для TTS (Professional Voice Clone Ильи).
Конвертация MP3 → OGG для TG voice через ffmpeg.

Mock-режим: генерирует пустой OGG/MP3 файл для тестов без API ключа.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Literal, Optional

log = logging.getLogger("aisales.media")

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")

# Кэш голосового вывода (text hash → file path) — экономит вызовы API
CACHE_DIR = Path(os.getenv("MEDIA_CACHE_DIR", "/tmp/aisales-media-cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ============ Public API ============

async def text_to_voice(
    text: str,
    target_format: Literal["mp3", "ogg", "opus"] = "ogg",
    voice_id: Optional[str] = None,
    stability: float = 0.5,
    similarity: float = 0.75,
    speed: float = 1.0,
) -> Path:
    """
    Превратить текст в голосовое сообщение.

    Возвращает путь к локальному файлу. Готов к отправке в TG.

    Параметры:
    - target_format: ogg для TG voice, mp3 для IG audio
    - voice_id: переопределить дефолтный голос (для тестов)
    - stability/similarity: настройки ElevenLabs (0..1)
    - speed: скорость воспроизведения (0.7..1.2)
    """
    voice = voice_id or ELEVENLABS_VOICE_ID

    if MOCK_MODE or not ELEVENLABS_API_KEY or not voice:
        return _mock_voice_file(text, target_format)

    # Реальный вызов
    mp3_path = await _generate_via_elevenlabs(text, voice, stability, similarity, speed)

    if target_format == "mp3":
        return mp3_path

    # Конвертация в нужный формат
    out_path = mp3_path.with_suffix(f".{target_format}")
    _convert_audio(mp3_path, out_path, target_format)
    return out_path


async def voice_to_text(audio_path: Path, language: str = "ru") -> str:
    """
    Транскрибировать аудио (от клиента) в текст для подачи агенту.

    Использует Whisper (локальный faster-whisper или OpenAI API).
    """
    if MOCK_MODE:
        log.info("[MOCK] voice_to_text: %s → '...mock transcript...'", audio_path)
        return "[VOICE TRANSCRIPT MOCK · текст голосового сообщения]"

    # Локальный faster-whisper
    try:
        from faster_whisper import WhisperModel  # type: ignore
        model = WhisperModel("small", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(str(audio_path), language=language, beam_size=5)
        return " ".join(s.text.strip() for s in segments)
    except ImportError:
        pass

    # Fallback: OpenAI Whisper API
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        from openai import OpenAI  # type: ignore
        client = OpenAI(api_key=api_key)
        with audio_path.open("rb") as f:
            r = client.audio.transcriptions.create(model="whisper-1", file=f, language=language)
        return r.text  # type: ignore

    raise RuntimeError("Ни faster-whisper, ни OPENAI_API_KEY не доступны")


# ============ ElevenLabs ============

async def _generate_via_elevenlabs(
    text: str, voice_id: str, stability: float, similarity: float, speed: float,
) -> Path:
    """Вызвать ElevenLabs API. Возвращает локальный MP3-файл."""
    try:
        import httpx  # type: ignore
    except ImportError:
        raise RuntimeError("pip install httpx")

    # Кэш-ключ по содержимому + параметрам
    cache_key = _hash_content(text, voice_id, stability, similarity, speed)
    cached = CACHE_DIR / f"{cache_key}.mp3"
    if cached.exists() and cached.stat().st_size > 0:
        log.info("media · cache hit · %s", cached.name)
        return cached

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity,
            "use_speaker_boost": True,
        },
    }
    if speed != 1.0:
        payload["voice_settings"]["speed"] = speed  # type: ignore

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    log.info("media · ElevenLabs TTS · voice=%s · len=%d", voice_id, len(text))
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        cached.write_bytes(r.content)
    log.info("media · saved %s (%d bytes)", cached.name, cached.stat().st_size)
    return cached


# ============ Audio conversion ============

def _convert_audio(src: Path, dst: Path, target_format: str) -> None:
    """ffmpeg-конвертация. TG voice требует OGG/Opus."""
    if not shutil.which("ffmpeg"):
        log.warning("ffmpeg не установлен — возвращаю исходный MP3")
        shutil.copy(src, dst.with_suffix(".mp3"))
        return

    # Параметры для разных форматов
    if target_format == "ogg" or target_format == "opus":
        # TG voice спецификация: OGG/Opus, моно, 48kHz
        cmd = [
            "ffmpeg", "-y", "-i", str(src),
            "-c:a", "libopus", "-b:a", "32k",
            "-ar", "48000", "-ac", "1",
            str(dst),
        ]
    else:
        cmd = ["ffmpeg", "-y", "-i", str(src), str(dst)]

    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=60)
    except subprocess.CalledProcessError as e:
        log.error("ffmpeg failed: %s", e.stderr.decode()[:200])
        raise


# ============ Mock ============

def _mock_voice_file(text: str, fmt: str) -> Path:
    """Создать пустой файл для тестов."""
    key = _hash_content(text, "mock", 0, 0, 0)
    path = CACHE_DIR / f"{key}-mock.{fmt}"
    if not path.exists():
        path.write_bytes(b"")  # empty file, just for path consistency
    log.info("[MOCK] media · %s · text='%s'", path.name, text[:60])
    return path


def _hash_content(*parts) -> str:
    import hashlib
    h = hashlib.sha256()
    for p in parts:
        h.update(str(p).encode())
    return h.hexdigest()[:16]


# ============ Diagnostics ============

def check_setup() -> dict:
    """Проверка что нужное окружение настроено. Для /ready endpoint."""
    return {
        "elevenlabs_api_key": "set" if ELEVENLABS_API_KEY else "missing",
        "elevenlabs_voice_id": "set" if ELEVENLABS_VOICE_ID else "missing",
        "ffmpeg": "ok" if shutil.which("ffmpeg") else "missing",
        "cache_dir": str(CACHE_DIR),
        "cache_files": len(list(CACHE_DIR.glob("*"))),
        "mock_mode": MOCK_MODE,
    }
