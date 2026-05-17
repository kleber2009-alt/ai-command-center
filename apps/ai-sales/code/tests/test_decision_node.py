"""Tests · decide_action_node."""
from __future__ import annotations

import os

os.environ.setdefault("AISALES_MOCK", "1")

from agents.nodes import decide_action_node
from agents.state import init_state


def _state_with(channel="tg", stage="hello", segment="unknown", score=0,
                response_text="ok", media_type="text"):
    s = init_state("test", channel, "hi")  # type: ignore
    s["current_stage"] = stage  # type: ignore
    s["segment"] = segment  # type: ignore
    s["icp_match"] = score
    s["response_text"] = response_text
    s["incoming_media_type"] = media_type
    return s


def test_hot_pitch_in_tg_gets_circle():
    s = _state_with(channel="tg", stage="pitch", segment="A", score=78)
    s = decide_action_node(s)
    assert s["response_action"] == "circle"
    assert "hot lead" in s["action_reason"]


def test_closing_hot_in_tg_gets_circle():
    s = _state_with(channel="tg", stage="close", segment="A", score=85)
    s = decide_action_node(s)
    assert s["response_action"] == "circle"


def test_hot_pitch_in_ig_no_circle():
    """IG не поддерживает кружочки, не должен выбирать."""
    s = _state_with(channel="ig", stage="pitch", segment="A", score=78)
    s = decide_action_node(s)
    # Должен быть text (default) или voice (long response)
    assert s["response_action"] in ("text", "voice")


def test_long_pitch_response_voice():
    long_text = "Под твою ситуацию у нас есть пакет. " * 10  # 350+ chars
    s = _state_with(channel="tg", stage="pitch", segment="B", score=50,
                    response_text=long_text)
    s = decide_action_node(s)
    assert s["response_action"] == "voice"


def test_followup_segment_a_voice():
    s = _state_with(channel="tg", stage="followup", segment="A", score=70)
    s = decide_action_node(s)
    assert s["response_action"] == "voice"


def test_mirror_voice_from_client():
    s = _state_with(media_type="voice")
    s = decide_action_node(s)
    assert s["response_action"] == "voice"
    assert "mirror" in s["action_reason"]


def test_mirror_circle_from_client():
    s = _state_with(media_type="circle")
    s = decide_action_node(s)
    assert s["response_action"] == "voice"  # отвечаем голосом


def test_default_text():
    s = _state_with(channel="tg", stage="hello", segment="C", score=20)
    s = decide_action_node(s)
    assert s["response_action"] == "text"
    assert "default" in s["action_reason"]


def test_escalation_override():
    """Если уже escalate — decision-node не трогает."""
    s = _state_with()
    s["response_action"] = "escalate"
    s = decide_action_node(s)
    assert s["response_action"] == "escalate"
