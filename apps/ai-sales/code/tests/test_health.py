"""Тесты API endpoints (mock-режим)."""
from __future__ import annotations

import os

os.environ.setdefault("AISALES_MOCK", "1")

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["service"] == "ai-sales"
    assert data["status"] == "ok"


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_clients_list():
    r = client.get("/api/v1/clients")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


def test_clients_filter_by_channel():
    r = client.get("/api/v1/clients?channel=ig")
    assert r.status_code == 200
    for c in r.json()["items"]:
        assert c["channel"] == "ig"


def test_clients_filter_by_segment_a():
    r = client.get("/api/v1/clients?segment=A")
    assert r.status_code == 200
    for c in r.json()["items"]:
        assert c["segment"] == "A"


def test_clients_score_range():
    r = client.get("/api/v1/clients?score_min=75&score_max=100")
    assert r.status_code == 200
    for c in r.json()["items"]:
        assert 75 <= c["score"] <= 100


def test_agents_list():
    r = client.get("/api/v1/agents")
    assert r.status_code == 200
    agents = r.json()
    assert len(agents) == 4
    types = {a["type"] for a in agents}
    assert types == {"ig", "tg", "analyst", "rop"}


def test_agent_pause():
    r = client.post("/api/v1/agents/ig/pause?duration_min=30")
    assert r.status_code == 200
    assert r.json()["paused_for_min"] == 30
