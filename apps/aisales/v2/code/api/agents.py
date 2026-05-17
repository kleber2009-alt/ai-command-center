"""Agents API · статус, конфигурация, действия."""
from __future__ import annotations

import os
from typing import Literal

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

router = APIRouter(prefix="/api/v1/agents", tags=["agents"]) if HAS_FASTAPI else None

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"


if HAS_FASTAPI:

    class AgentStatus(BaseModel):
        type: Literal["ig", "tg", "analyst", "rop"]
        status: Literal["online", "idle", "paused", "error"]
        model: str
        active_dialogs: int
        messages_24h: int
        avg_latency_ms: int
        autonomy_pct: int
        voice_consistency: int  # 0-100
        cost_24h_usd: float


    AGENTS = [
        AgentStatus(type="ig", status="online", model="claude-opus-4.7", active_dialogs=23,
                    messages_24h=486, avg_latency_ms=1200, autonomy_pct=91, voice_consistency=87, cost_24h_usd=8.40),
        AgentStatus(type="tg", status="online", model="claude-opus-4.7", active_dialogs=17,
                    messages_24h=312, avg_latency_ms=1400, autonomy_pct=89, voice_consistency=85, cost_24h_usd=6.20),
        AgentStatus(type="analyst", status="online", model="claude-sonnet-4.6", active_dialogs=0,
                    messages_24h=128, avg_latency_ms=800, autonomy_pct=100, voice_consistency=0, cost_24h_usd=1.80),
        AgentStatus(type="rop", status="idle", model="claude-opus-4.7", active_dialogs=0,
                    messages_24h=4, avg_latency_ms=900, autonomy_pct=100, voice_consistency=0, cost_24h_usd=0.40),
    ]


if HAS_FASTAPI and router:

    @router.get("", response_model=list[AgentStatus])
    async def list_agents():
        if MOCK_MODE:
            return AGENTS
        # TODO: реальный статус из БД
        raise HTTPException(status_code=501)


    @router.get("/{agent_type}")
    async def get_agent(agent_type: str):
        if MOCK_MODE:
            for a in AGENTS:
                if a.type == agent_type:
                    return a
            raise HTTPException(status_code=404)
        raise HTTPException(status_code=501)


    @router.post("/{agent_type}/pause")
    async def pause_agent(agent_type: str, duration_min: int = 60):
        if MOCK_MODE:
            return {"ok": True, "agent": agent_type, "paused_for_min": duration_min}
        raise HTTPException(status_code=501)


    @router.post("/{agent_type}/resume")
    async def resume_agent(agent_type: str):
        if MOCK_MODE:
            return {"ok": True, "agent": agent_type, "status": "resumed"}
        raise HTTPException(status_code=501)
