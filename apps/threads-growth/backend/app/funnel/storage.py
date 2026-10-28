"""Картинки к посту 1: Threads забирает медиа только по публичной ссылке.

Фото, присланное в бот, перекладываем в MinIO на aisales-prod и отдаём Threads
временной подписанной ссылкой на время публикации. Подпись считается под
публичный host (MINIO_PUBLIC_ENDPOINT, через Caddy), загрузка — по внутреннему.
"""
from __future__ import annotations

import io
from datetime import timedelta
from functools import lru_cache

from app.config import settings

URL_TTL = timedelta(hours=2)


def configured() -> bool:
    return bool(settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key)


@lru_cache
def _client(public: bool = False):
    if not configured():
        raise RuntimeError("MinIO не настроен (MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY).")
    from minio import Minio

    endpoint = (settings.minio_public_endpoint or settings.minio_endpoint) if public else settings.minio_endpoint
    secure = settings.minio_public_secure if public and settings.minio_public_endpoint else settings.minio_secure
    # region задан явно — presign считается локально, без запроса к серверу.
    return Minio(endpoint, access_key=settings.minio_access_key, secret_key=settings.minio_secret_key,
                 secure=secure, region=settings.minio_region)


def put_image(key: str, data: bytes, content_type: str = "image/jpeg") -> str:
    client = _client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
    client.put_object(settings.minio_bucket, key, io.BytesIO(data), len(data), content_type=content_type)
    return key


def public_url(key: str, ttl: timedelta = URL_TTL) -> str:
    return _client(public=True).presigned_get_object(settings.minio_bucket, key, expires=ttl)
