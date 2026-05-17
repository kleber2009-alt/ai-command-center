"""Tests · media + tg_client + ig_client + wav2lip · mock-режим."""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

os.environ["AISALES_MOCK"] = "1"

from services import media, wav2lip, storage
from services import tg_client as tg
from services import ig_client as ig


@pytest.mark.asyncio
async def test_text_to_voice_mock():
    path = await media.text_to_voice("Привет, это тест", target_format="ogg")
    assert isinstance(path, Path)
    assert path.suffix == ".ogg"


@pytest.mark.asyncio
async def test_voice_to_text_mock():
    fake = Path("/tmp/fake.ogg")
    fake.write_bytes(b"")
    text = await media.voice_to_text(fake)
    assert "TRANSCRIPT" in text or "транскрипт" in text.lower()


@pytest.mark.asyncio
async def test_wav2lip_mock():
    fake_audio = Path("/tmp/fake.mp3")
    fake_audio.write_bytes(b"")
    circle = await wav2lip.audio_to_circle(fake_audio)
    assert circle.suffix == ".mp4"
    assert circle.exists()


@pytest.mark.asyncio
async def test_storage_upload_mock():
    fake = Path("/tmp/upload-test.mp3")
    fake.write_bytes(b"data")
    url = await storage.upload(fake, key_prefix="test")
    assert url.startswith("https://")
    assert "test" in url or "mock" in url


@pytest.mark.asyncio
async def test_tg_send_text_mock():
    r = await tg.send_text(123456, "test")
    assert r["ok"]
    assert r.get("mock")


@pytest.mark.asyncio
async def test_tg_send_voice_mock():
    fake = Path("/tmp/test.ogg")
    fake.write_bytes(b"x")
    r = await tg.send_voice(123456, fake, duration=30)
    assert r["ok"]


@pytest.mark.asyncio
async def test_tg_send_video_note_mock():
    fake = Path("/tmp/test.mp4")
    fake.write_bytes(b"x")
    r = await tg.send_video_note(123456, fake, duration=20)
    assert r["ok"]


@pytest.mark.asyncio
async def test_tg_download_file_mock():
    path = await tg.download_file("AgADBgADrKcxG_abc", Path("/tmp"))
    assert path is not None
    assert path.exists()


@pytest.mark.asyncio
async def test_ig_send_text_mock():
    r = await ig.send_text("ig_user_001", "test")
    assert r["ok"]


@pytest.mark.asyncio
async def test_ig_send_audio_mock():
    r = await ig.send_audio("ig_user_001", "https://example.com/audio.mp3")
    assert r["ok"]


@pytest.mark.asyncio
async def test_ig_download_attachment_mock():
    path = await ig.download_attachment("https://lookaside.fbsbx.com/example.mp4", Path("/tmp"))
    assert path is not None


def test_setup_checks():
    """Проверяем что check_setup возвращает структуру."""
    assert media.check_setup()["mock_mode"]
    assert wav2lip.check_setup()["mock_mode"]
    assert tg.check_setup()["mock_mode"]
    assert ig.check_setup()["mock_mode"]
    assert storage.check_setup()["mock_mode"]
