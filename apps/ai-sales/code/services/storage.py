"""
MinIO storage · загрузка/скачивание медиа.

Используется для:
- Хостинга аудио/видео которые отправляем в IG (нужен публичный HTTPS URL)
- Архива всех отправленных/полученных файлов
- Кэша wav2lip-результатов

Mock-режим: возвращает фейк-URL вместо реальной загрузки.
"""
from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Optional

log = logging.getLogger("aisales.storage")

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS = os.getenv("MINIO_ACCESS_KEY", "")
MINIO_SECRET = os.getenv("MINIO_SECRET_KEY", "")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "aisales-media")
MINIO_PUBLIC_BASE = os.getenv("MINIO_PUBLIC_BASE", f"https://media.aisales.local")
MINIO_SECURE = os.getenv("MINIO_SECURE", "0") == "1"


_client = None


def _get_client():
    """Lazy init MinIO client."""
    global _client
    if _client is not None:
        return _client
    try:
        from minio import Minio  # type: ignore
    except ImportError:
        raise RuntimeError("pip install minio")
    _client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS,
        secret_key=MINIO_SECRET,
        secure=MINIO_SECURE,
    )
    # Создать bucket если нет
    if not _client.bucket_exists(MINIO_BUCKET):
        _client.make_bucket(MINIO_BUCKET)
        log.info("storage · created bucket %s", MINIO_BUCKET)
    return _client


async def upload(file_path: Path, key_prefix: str = "outbox") -> str:
    """
    Загрузить локальный файл в MinIO. Возвращает публичный URL.
    """
    if MOCK_MODE or not MINIO_ACCESS:
        url = f"https://mock-cdn.aisales.local/{key_prefix}/{file_path.name}"
        log.info("[MOCK STORAGE] %s → %s", file_path.name, url)
        return url

    client = _get_client()
    object_name = f"{key_prefix}/{uuid.uuid4().hex[:12]}/{file_path.name}"

    # Content-Type на основе расширения
    content_types = {
        ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/opus",
        ".mp4": "video/mp4", ".webm": "video/webm",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".pdf": "application/pdf", ".txt": "text/plain",
    }
    ext = file_path.suffix.lower()
    content_type = content_types.get(ext, "application/octet-stream")

    client.fput_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
        file_path=str(file_path),
        content_type=content_type,
    )

    url = f"{MINIO_PUBLIC_BASE}/{MINIO_BUCKET}/{object_name}"
    log.info("storage · uploaded %s → %s", file_path.name, url)
    return url


async def download(object_name: str, dst_path: Path) -> Path:
    """Скачать объект из MinIO в локальный файл."""
    if MOCK_MODE or not MINIO_ACCESS:
        dst_path.write_bytes(b"")
        return dst_path

    client = _get_client()
    client.fget_object(MINIO_BUCKET, object_name, str(dst_path))
    return dst_path


async def presigned_url(object_name: str, expires_seconds: int = 3600) -> str:
    """Сгенерировать временную ссылку для приватных объектов."""
    if MOCK_MODE or not MINIO_ACCESS:
        return f"https://mock-cdn.aisales.local/signed/{object_name}?exp={expires_seconds}"

    from datetime import timedelta
    client = _get_client()
    return client.presigned_get_object(
        MINIO_BUCKET, object_name,
        expires=timedelta(seconds=expires_seconds),
    )


def check_setup() -> dict:
    return {
        "endpoint": MINIO_ENDPOINT,
        "bucket": MINIO_BUCKET,
        "access_key": "set" if MINIO_ACCESS else "missing",
        "public_base": MINIO_PUBLIC_BASE,
        "mock_mode": MOCK_MODE,
    }
