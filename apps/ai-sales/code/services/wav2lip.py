"""
Wav2Lip · генерация видео-кружочков для TG.

Бэкенды (в порядке приоритета):
    1. HeyGen Talking Photo — если HEYGEN_API_KEY установлен (default)
    2. Sieve wav2lip        — если SIEVE_API_KEY установлен
    3. Mock                 — заглушка для тестов

Pipeline:
    audio (mp3) → MinIO tmp/ → presigned URL
    → HeyGen talking_photo + audio_url → MP4
    → ffmpeg crop 480×480 круг
    → TG video_note
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import uuid
from datetime import timedelta
from pathlib import Path
from typing import Optional

log = logging.getLogger("aisales.wav2lip")

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"

HEYGEN_API_KEY     = os.getenv("HEYGEN_API_KEY", "")
HEYGEN_PHOTO_ID    = os.getenv("HEYGEN_TALKING_PHOTO_ID", "")  # pre-uploaded avatar
FACE_PHOTO_URL     = os.getenv("ILYA_FACE_PHOTO_URL", "")      # fallback: raw photo URL

SIEVE_API_KEY      = os.getenv("SIEVE_API_KEY", "")
SIEVE_FUNCTION     = os.getenv("SIEVE_FUNCTION", "sieve/wav2lip")

CACHE_DIR = Path(os.getenv("MEDIA_CACHE_DIR", "/tmp/aisales-media-cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

_MINIO_INTERNAL = os.getenv("MINIO_ENDPOINT", "aisales-minio:9000")
_MINIO_EXTERNAL = os.getenv("MINIO_ENDPOINT_EXTERNAL", "media.46-62-215-11.nip.io")
_MINIO_ACCESS   = os.getenv("MINIO_ACCESS_KEY", "")
_MINIO_SECRET   = os.getenv("MINIO_SECRET_KEY", "")
_MINIO_BUCKET   = os.getenv("MINIO_BUCKET", "aisales-media")


# ═══════════════════════════════════════════════
# Public entry point
# ═══════════════════════════════════════════════

async def audio_to_circle(
    audio_path: Path,
    face_photo_url: Optional[str] = None,
    duration_max: int = 60,
) -> Path:
    """
    Аудио → видео-кружок (TG video_note). Возвращает путь к MP4.
    Выбирает бэкенд автоматически: HeyGen → Sieve → Mock.
    """
    if MOCK_MODE:
        return _mock_circle_file(audio_path)

    if HEYGEN_API_KEY:
        raw_mp4 = await _heygen_talking_photo(audio_path)
        return _make_tg_circle(raw_mp4, duration_max)

    if SIEVE_API_KEY:
        photo = face_photo_url or FACE_PHOTO_URL
        if not photo:
            raise RuntimeError("ILYA_FACE_PHOTO_URL не настроен")
        raw_mp4 = await _sieve_wav2lip(audio_path, photo)
        return _make_tg_circle(raw_mp4, duration_max)

    log.warning("wav2lip · нет API ключей — mock")
    return _mock_circle_file(audio_path)


# ═══════════════════════════════════════════════
# MinIO helpers
# ═══════════════════════════════════════════════

async def _minio_upload(audio_path: Path) -> tuple[str, str]:
    """Загружает аудио в MinIO tmp/. Возвращает (object_name, presigned_url)."""
    object_name = f"tmp/{uuid.uuid4().hex}{audio_path.suffix}"

    def _do_upload():
        from minio import Minio  # type: ignore
        # Загрузка через внутренний endpoint
        Minio(_MINIO_INTERNAL, access_key=_MINIO_ACCESS, secret_key=_MINIO_SECRET, secure=False).fput_object(
            _MINIO_BUCKET, object_name, str(audio_path), content_type="audio/mpeg"
        )
        # Presigned URL через внешний (публичный) endpoint
        url = Minio(_MINIO_EXTERNAL, access_key=_MINIO_ACCESS, secret_key=_MINIO_SECRET, secure=True).presigned_get_object(
            _MINIO_BUCKET, object_name, expires=timedelta(hours=1)
        )
        return url

    url = await asyncio.to_thread(_do_upload)
    log.info("wav2lip · audio → MinIO %s", object_name)
    return object_name, url


async def _minio_delete(object_name: str) -> None:
    def _do():
        from minio import Minio  # type: ignore
        Minio(_MINIO_INTERNAL, access_key=_MINIO_ACCESS, secret_key=_MINIO_SECRET, secure=False).remove_object(_MINIO_BUCKET, object_name)
    try:
        await asyncio.to_thread(_do)
    except Exception as e:
        log.warning("wav2lip · MinIO cleanup failed: %s", e)


# ═══════════════════════════════════════════════
# HeyGen Talking Photo
# ═══════════════════════════════════════════════

async def _heygen_talking_photo(audio: Path) -> Path:
    """
    Фото + аудио → talking head MP4 через HeyGen API v2.
    Использует talking_photo_id (pre-uploaded avatar) если задан,
    иначе talking_photo_url (сырое фото).
    """
    import httpx

    log.info("heygen · start · audio=%s", audio.name)

    tmp_key, audio_url = await _minio_upload(audio)
    log.info("heygen · audio_url=%s", audio_url[:80])

    headers = {"X-Api-Key": HEYGEN_API_KEY, "Content-Type": "application/json"}

    # Character: предпочитаем talking_photo_id (быстрее, без re-upload фото)
    if HEYGEN_PHOTO_ID:
        character = {"type": "talking_photo", "talking_photo_id": HEYGEN_PHOTO_ID}
    elif FACE_PHOTO_URL:
        character = {"type": "talking_photo", "talking_photo_url": FACE_PHOTO_URL}
    else:
        raise RuntimeError("Нужен HEYGEN_TALKING_PHOTO_ID или ILYA_FACE_PHOTO_URL")

    payload = {
        "video_inputs": [{
            "character": character,
            "voice": {"type": "audio", "audio_url": audio_url},
        }],
        "dimension": {"width": 512, "height": 512},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.heygen.com/v2/video/generate",
                json=payload, headers=headers,
            )
            if r.status_code != 200:
                log.error("heygen · generate error %d: %s", r.status_code, r.text[:300])
                r.raise_for_status()
            resp = r.json()
            video_id = (resp.get("data") or {}).get("video_id")
            if not video_id:
                raise RuntimeError(f"HeyGen: нет video_id: {resp}")
            log.info("heygen · video_id=%s", video_id)

        # Polling до готовности
        async with httpx.AsyncClient(timeout=30) as client:
            for attempt in range(120):  # до 6 минут
                await asyncio.sleep(3)
                sr = await client.get(
                    f"https://api.heygen.com/v1/video_status.get?video_id={video_id}",
                    headers=headers,
                )
                sr.raise_for_status()
                data = sr.json().get("data") or {}
                status = data.get("status", "?")
                log.info("heygen · poll #%d status=%s", attempt, status)

                if status == "completed":
                    video_url = data.get("video_url")
                    if not video_url:
                        raise RuntimeError(f"HeyGen completed без video_url: {data}")
                    break
                elif status == "failed":
                    raise RuntimeError(f"HeyGen failed: {data.get('error', data)}")
            else:
                raise TimeoutError("HeyGen timed out (6 min)")

        async with httpx.AsyncClient(timeout=60) as client:
            vr = await client.get(video_url)
            vr.raise_for_status()

        out = CACHE_DIR / f"heygen-{video_id}.mp4"
        out.write_bytes(vr.content)
        log.info("heygen · готов %s (%d bytes)", out.name, out.stat().st_size)
        return out

    finally:
        await _minio_delete(tmp_key)


# ═══════════════════════════════════════════════
# Sieve (резервный вариант)
# ═══════════════════════════════════════════════

async def _sieve_wav2lip(audio: Path, photo_url: str) -> Path:
    import httpx

    log.info("sieve · start · audio=%s", audio.name)
    tmp_key, audio_url = await _minio_upload(audio)

    headers = {"X-API-Key": SIEVE_API_KEY, "Content-Type": "application/json"}
    payload = {
        "function": SIEVE_FUNCTION,
        "inputs": {"file": {"url": photo_url}, "audio": {"url": audio_url}},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post("https://mango.sievedata.com/v2/push", json=payload, headers=headers)
            r.raise_for_status()
            job_id = r.json()["id"]
            log.info("sieve · job_id=%s", job_id)

        async with httpx.AsyncClient(timeout=30) as client:
            for attempt in range(80):
                await asyncio.sleep(3)
                sr = await client.get(f"https://mango.sievedata.com/v2/jobs/{job_id}", headers={"X-API-Key": SIEVE_API_KEY})
                s = sr.json()
                job_status = s.get("status", "")
                log.info("sieve · poll #%d status=%s", attempt, job_status)
                if job_status == "finished":
                    outputs = s.get("outputs", [])
                    video_url = (
                        (outputs[0].get("data") or {}).get("url")
                        or outputs[0].get("url")
                        or (outputs[0].get("video") or {}).get("url")
                    ) if outputs else None
                    if not video_url:
                        raise RuntimeError(f"Sieve: нет URL в outputs: {s}")
                    break
                elif job_status in ("error", "failed"):
                    raise RuntimeError(f"Sieve error: {s.get('error')}")
            else:
                raise TimeoutError("Sieve timed out (4 min)")

        async with httpx.AsyncClient(timeout=60) as client:
            vr = await client.get(video_url)
        out = CACHE_DIR / f"sieve-{job_id}.mp4"
        out.write_bytes(vr.content)
        log.info("sieve · готов %s (%d bytes)", out.name, out.stat().st_size)
        return out

    finally:
        await _minio_delete(tmp_key)


# ═══════════════════════════════════════════════
# ffmpeg → TG video_note
# ═══════════════════════════════════════════════

def _make_tg_circle(src: Path, duration_max: int) -> Path:
    if not shutil.which("ffmpeg"):
        log.warning("ffmpeg отсутствует — возвращаю сырой MP4")
        return src

    dst = src.with_name(f"{src.stem}-circle.mp4")
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
        log.error("ffmpeg: %s", e.stderr.decode()[:300])
        raise

    log.info("wav2lip · circle %s (%d bytes)", dst.name, dst.stat().st_size)
    return dst


# ═══════════════════════════════════════════════
# Mock
# ═══════════════════════════════════════════════

def _mock_circle_file(audio_path: Path) -> Path:
    path = CACHE_DIR / f"mock-circle-{uuid.uuid4().hex[:12]}.mp4"
    path.write_bytes(b"")
    log.info("[MOCK] wav2lip · %s", path.name)
    return path


# ═══════════════════════════════════════════════
# Diagnostics
# ═══════════════════════════════════════════════

def check_setup() -> dict:
    backend = "mock"
    if not MOCK_MODE:
        if HEYGEN_API_KEY:
            backend = "heygen"
        elif SIEVE_API_KEY:
            backend = "sieve"
    return {
        "backend": backend,
        "heygen_api_key": "set" if HEYGEN_API_KEY else "missing",
        "heygen_photo_id": HEYGEN_PHOTO_ID or "missing",
        "sieve_api_key": "set" if SIEVE_API_KEY else "missing",
        "face_photo_url": "set" if FACE_PHOTO_URL else "missing",
        "ffmpeg": "ok" if shutil.which("ffmpeg") else "missing",
        "mock_mode": MOCK_MODE,
    }
