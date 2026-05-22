"""
Wav2Lip · генерация видео-кружочков для TG (липсинк лица + голос).

Стратегия: используем хостед API (по умолчанию Sieve), потому что Wav2Lip
требует GPU и собственная инфра дороже. Альтернативы:
- Sieve · sieve.dev (default, ~$0.03/min)
- Replicate · replicate.com/wav2lip
- Self-hosted на RunPod/Modal

Mock-режим: возвращает пустой MP4 файл.

Pipeline:
    1. Берёт photo_url (фото Ильи) — может быть локальный или S3 URL
    2. Берёт audio_path (от media.text_to_voice)
    3. Зовёт Sieve API → получает MP4 (квадратное видео)
    4. ffmpeg обрезает в круг (TG video_note format)
    5. Возвращает локальный путь к готовому файлу
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Optional

log = logging.getLogger("aisales.wav2lip")

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"

SIEVE_API_KEY = os.getenv("SIEVE_API_KEY", "")
SIEVE_FUNCTION = os.getenv("SIEVE_FUNCTION", "sieve/wav2lip")  # или другой пайплайн

# Фото Ильи (для лица в кружочке). Должно быть загружено в MinIO или быть URL.
FACE_PHOTO_URL = os.getenv("ILYA_FACE_PHOTO_URL", "")

CACHE_DIR = Path(os.getenv("MEDIA_CACHE_DIR", "/tmp/aisales-media-cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)


async def audio_to_circle(
    audio_path: Path,
    face_photo_url: Optional[str] = None,
    duration_max: int = 60,
) -> Path:
    """
    Превратить аудио в видео-кружок (TG video_note).

    Возвращает локальный путь к MP4. Готов к отправке через sendVideoNote.

    Аргументы:
    - audio_path: путь к OGG/MP3 от media.text_to_voice
    - face_photo_url: URL фото лица (если не указан, берём из env)
    - duration_max: обрезать видео если длиннее (TG лимит ~60 сек для кружков)
    """
    if MOCK_MODE or not SIEVE_API_KEY:
        return _mock_circle_file(audio_path)

    photo = face_photo_url or FACE_PHOTO_URL
    if not photo:
        raise RuntimeError("ILYA_FACE_PHOTO_URL не настроен")

    # Sieve API
    raw_mp4 = await _sieve_wav2lip(audio_path, photo)

    # Обрезка в квадрат + circular crop для TG video_note
    circle_mp4 = _make_tg_circle(raw_mp4, duration_max)
    return circle_mp4


# ============ Sieve API ============

async def _sieve_wav2lip(audio: Path, photo_url: str) -> Path:
    """Зов Sieve API для wav2lip генерации."""
    try:
        import httpx  # type: ignore
    except ImportError:
        raise RuntimeError("pip install httpx")

    log.info("wav2lip · Sieve · audio=%s · photo=%s", audio.name, photo_url[:60])

    # 1. Загружаем audio в Sieve (можно через base64 или signed URL)
    # Здесь упрощённая версия — реально через файловый upload
    base_url = "https://mango.sievedata.com/v2/push"
    headers = {"X-API-Key": SIEVE_API_KEY, "Content-Type": "application/json"}

    payload = {
        "function": SIEVE_FUNCTION,
        "inputs": {
            "file": {"url": photo_url},  # фото
            "audio": {"url": "AUDIO_UPLOAD_URL"},  # TODO: загрузить audio в S3 первым
        },
    }

    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(base_url, json=payload, headers=headers)
        r.raise_for_status()
        job = r.json()
        job_id = job["id"]

        # Polling до готовности (Sieve async)
        for attempt in range(60):  # ~3 минуты max
            await asyncio.sleep(3)
            status_r = await client.get(
                f"https://mango.sievedata.com/v2/jobs/{job_id}",
                headers={"X-API-Key": SIEVE_API_KEY},
            )
            status = status_r.json()
            if status.get("status") == "finished":
                video_url = status["outputs"][0]["data"]["url"]
                break
            elif status.get("status") == "error":
                raise RuntimeError(f"Sieve error: {status.get('error')}")
        else:
            raise TimeoutError("Sieve job timed out after 3 min")

        # Скачиваем результат
        video_r = await client.get(video_url)
        out = CACHE_DIR / f"sieve-{job_id}.mp4"
        out.write_bytes(video_r.content)
        log.info("wav2lip · готов %s (%d bytes)", out.name, out.stat().st_size)
        return out


# ============ TG video_note преобразование ============

def _make_tg_circle(src: Path, duration_max: int) -> Path:
    """
    TG video_note требует:
    - Квадратное видео (например 240×240, 384×384, 480×480)
    - Длительность ≤ 60 секунд
    - MP4, H.264, AAC аудио
    """
    if not shutil.which("ffmpeg"):
        log.warning("ffmpeg отсутствует — возвращаю исходный MP4 без crop")
        return src

    dst = src.with_name(f"{src.stem}-circle.mp4")

    # Crop в квадрат (центр) + ресайз до 480px + ограничение длительности
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-vf", "crop=ih:ih,scale=480:480",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "64k",
        "-t", str(duration_max),
        "-movflags", "+faststart",
        str(dst),
    ]

    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=120)
    except subprocess.CalledProcessError as e:
        log.error("ffmpeg circle: %s", e.stderr.decode()[:200])
        raise

    log.info("wav2lip · circle %s (%d bytes)", dst.name, dst.stat().st_size)
    return dst


# ============ Mock ============

def _mock_circle_file(audio_path: Path) -> Path:
    """Заглушка: пустой .mp4 для тестов."""
    fake_id = uuid.uuid4().hex[:12]
    path = CACHE_DIR / f"mock-circle-{fake_id}.mp4"
    path.write_bytes(b"")
    log.info("[MOCK] wav2lip · %s · audio=%s", path.name, audio_path.name)
    return path


# ============ Diagnostics ============

def check_setup() -> dict:
    return {
        "sieve_api_key": "set" if SIEVE_API_KEY else "missing",
        "face_photo_url": "set" if FACE_PHOTO_URL else "missing",
        "ffmpeg": "ok" if shutil.which("ffmpeg") else "missing",
        "mock_mode": MOCK_MODE,
    }
