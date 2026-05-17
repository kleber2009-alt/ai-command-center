"""Tests · webhook handlers end-to-end (mock-режим)."""
from __future__ import annotations

import asyncio
import os

import pytest

os.environ["AISALES_MOCK"] = "1"

from webhooks.telegram import handle_update, parse_tg_update
from webhooks.instagram import handle_messaging_event, parse_ig_event


@pytest.mark.asyncio
async def test_tg_text_message():
    result = await handle_update({
        "update_id": 1,
        "message": {
            "chat": {"id": 12345},
            "from": {"username": "test_user"},
            "text": "Привет, расскажи про автоматизацию SMM"
        }
    })
    assert result["status"] == "responded"
    assert result["action"] == "text"


@pytest.mark.asyncio
async def test_tg_voice_message():
    result = await handle_update({
        "update_id": 2,
        "message": {
            "chat": {"id": 12345},
            "from": {"username": "test_user"},
            "voice": {"file_id": "AgADBgADrK_abc", "duration": 12}
        }
    })
    assert result["status"] == "responded"
    # Должен ответить голосом (mirror) или текстом
    assert result["action"] in ("text", "voice", "circle")


@pytest.mark.asyncio
async def test_tg_circle_message():
    result = await handle_update({
        "update_id": 3,
        "message": {
            "chat": {"id": 12345},
            "from": {"username": "test_user"},
            "video_note": {"file_id": "VN_abc", "duration": 15}
        }
    })
    assert result["status"] == "responded"


@pytest.mark.asyncio
async def test_tg_escalation():
    result = await handle_update({
        "update_id": 4,
        "message": {
            "chat": {"id": 99999},
            "from": {"username": "angry"},
            "text": "Вы меня обманули, верните деньги!"
        }
    })
    assert result["status"] == "escalated"
    assert result["reason"] == "complaint"


@pytest.mark.asyncio
async def test_tg_start_command():
    result = await handle_update({
        "update_id": 5,
        "message": {
            "chat": {"id": 12345},
            "from": {"username": "new_user"},
            "text": "/start"
        }
    })
    assert result["status"] == "started"


def test_tg_parse_invalid():
    assert parse_tg_update({"update_id": 1}) is None


def test_tg_parse_text():
    parsed = parse_tg_update({
        "message": {
            "chat": {"id": 1}, "from": {"username": "x"}, "text": "hi"
        }
    })
    assert parsed is not None
    assert parsed["media_type"] == "text"


@pytest.mark.asyncio
async def test_ig_text_event():
    result = await handle_messaging_event({
        "sender": {"id": "ig_user_001"},
        "recipient": {"id": "page_id"},
        "timestamp": 123,
        "message": {"text": "Привет, у вас есть пакет для агентств?"}
    })
    assert result["status"] in ("responded", "escalated")


@pytest.mark.asyncio
async def test_ig_audio_attachment():
    result = await handle_messaging_event({
        "sender": {"id": "ig_user_002"},
        "recipient": {"id": "page_id"},
        "message": {
            "attachments": [
                {"type": "audio", "payload": {"url": "https://lookaside.fbsbx.com/test.mp3"}}
            ]
        }
    })
    assert result["status"] in ("responded", "escalated")


def test_ig_parse_text():
    parsed = parse_ig_event({
        "sender": {"id": "u1"}, "recipient": {"id": "p1"},
        "message": {"text": "test"}
    })
    assert parsed is not None
    assert parsed["media_type"] == "text"
    assert parsed["text"] == "test"


def test_ig_parse_audio_attachment():
    parsed = parse_ig_event({
        "sender": {"id": "u1"}, "recipient": {"id": "p1"},
        "message": {"attachments": [{"type": "audio", "payload": {"url": "https://x"}}]}
    })
    assert parsed is not None
    assert parsed["media_type"] == "voice"
