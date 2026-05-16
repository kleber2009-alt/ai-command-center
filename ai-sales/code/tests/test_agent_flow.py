"""Тесты flow.py · mock-режим."""
from __future__ import annotations

import os
import pytest

os.environ.setdefault("AISALES_MOCK", "1")

from agents.flow import run_flow


def test_greeting_flow():
    result = run_flow(
        client_id="test-001",
        channel="ig",
        message="Привет, расскажи про автоматизацию SMM",
    )
    assert result["detected_intent"] == "greeting"
    assert result["current_stage"] == "hello"
    assert not result["needs_escalation"]
    assert result["response_action"] == "text"
    assert "response_text" in result and len(result["response_text"]) > 0


def test_escalation_complaint():
    result = run_flow(
        client_id="test-002",
        channel="ig",
        message="Вы меня обманули, верните деньги",
    )
    assert result["needs_escalation"] is True
    assert result["escalation_reason"] == "complaint"
    assert result["escalation_urgency"] == "now"
    assert result["response_action"] == "escalate"


def test_escalation_legal():
    result = run_flow(
        client_id="test-003",
        channel="tg",
        message="Я пойду в суд",
    )
    assert result["needs_escalation"] is True
    assert result["escalation_reason"] == "legal"


def test_price_question_flow():
    result = run_flow(
        client_id="test-004",
        channel="ig",
        message="А сколько это стоит?",
    )
    assert result["detected_intent"] == "price_question"
    assert result["current_stage"] == "close"
    assert not result["needs_escalation"]
    assert result["rag_used"] is True


def test_objection_flow():
    result = run_flow(
        client_id="test-005",
        channel="ig",
        message="Дорого, не подходит",
    )
    assert result["current_stage"] == "objections"
    assert not result["needs_escalation"]


def test_latency_tracked():
    result = run_flow("test-006", "ig", "Привет")
    assert "latency_ms" in result
    assert isinstance(result["latency_ms"], int)
