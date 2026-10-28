"""Голос → текст для правок и /story голосом.

Как в persona-studio: WHISPER_SERVICE_URL (self-hosted, OpenAI-совместимый
faster-whisper) приоритетнее, иначе OpenAI Whisper по OPENAI_API_KEY.
Голосовые Telegram приходят в OGG/Opus — Whisper принимает их как есть.
"""
from __future__ import annotations

from app.config import settings

MAX_BYTES = 25 * 1024 * 1024


def configured() -> bool:
    return bool(settings.whisper_service_url or settings.openai_api_key)


def transcribe(audio: bytes, filename: str = "voice.ogg", language: str = "ru") -> str:
    if not configured():
        raise RuntimeError("Нет WHISPER_SERVICE_URL / OPENAI_API_KEY — голос не распознать, пришлите текстом.")
    if len(audio) > MAX_BYTES:
        raise RuntimeError("Голосовое больше 25 МБ — пришлите покороче.")
    import httpx

    base = (settings.whisper_service_url or "https://api.openai.com").rstrip("/")
    key = settings.whisper_api_key if settings.whisper_service_url else settings.openai_api_key
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    r = httpx.post(
        f"{base}/v1/audio/transcriptions",
        headers=headers,
        data={"model": settings.whisper_model, "language": language, "response_format": "json"},
        files={"file": (filename, audio, "audio/ogg")},
        timeout=120.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"whisper {r.status_code}: {r.text[:300]}")
    return str(r.json().get("text", "")).strip()
