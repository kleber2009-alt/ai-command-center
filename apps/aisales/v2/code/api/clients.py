"""Clients API · CRUD + фильтры для Pipeline-экрана дашборда."""
from __future__ import annotations

import os
from typing import Literal, Optional

try:
    from fastapi import APIRouter, Depends, HTTPException, Query
    from pydantic import BaseModel
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    APIRouter = lambda **k: None  # type: ignore

router = APIRouter(prefix="/api/v1/clients", tags=["clients"]) if HAS_FASTAPI else None

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"


# ============ Schemas ============

if HAS_FASTAPI:

    class ClientOut(BaseModel):
        id: str
        channel: Literal["ig", "tg"]
        handle: str
        name: Optional[str]
        stage: str
        segment: str
        score: int
        icp_match: int
        last_message_preview: Optional[str] = None
        last_message_at: Optional[str] = None


    class ClientListResponse(BaseModel):
        items: list[ClientOut]
        total: int
        page: int
        per_page: int


# ============ Mock data ============

MOCK_CLIENTS = [
    {"id": "ce-001", "channel": "ig", "handle": "@anna_volkova", "name": "Анна Волкова",
     "stage": "objections", "segment": "A", "score": 82, "icp_match": 88,
     "last_message_preview": "«вы меня обманули...»", "last_message_at": "2026-05-16T21:02:00Z"},
    {"id": "ce-002", "channel": "ig", "handle": "@marina_v", "name": "Марина Веселова",
     "stage": "pitch", "segment": "A", "score": 78, "icp_match": 94,
     "last_message_preview": "«окей, смотрю...»", "last_message_at": "2026-05-16T21:02:00Z"},
    {"id": "ce-003", "channel": "ig", "handle": "@kate_b", "name": "Катя Берестова",
     "stage": "pitch", "segment": "A", "score": 78, "icp_match": 82,
     "last_message_preview": "отправил кейс", "last_message_at": "2026-05-16T20:55:00Z"},
    {"id": "ce-004", "channel": "tg", "handle": "@dmitry88", "name": "Дмитрий Мельников",
     "stage": "won", "segment": "A", "score": 91, "icp_match": 90,
     "last_message_preview": "«оплатил, жду документы»", "last_message_at": "2026-05-16T21:03:00Z"},
    {"id": "ce-005", "channel": "tg", "handle": "@sergey_t", "name": "Сергей Рябов",
     "stage": "pitch", "segment": "B", "score": 64, "icp_match": 70,
     "last_message_preview": "кружочек 0:14", "last_message_at": "2026-05-16T20:58:00Z"},
]


# ============ Routes ============

if HAS_FASTAPI and router:

    @router.get("", response_model=ClientListResponse)
    async def list_clients(
        channel: Optional[Literal["ig", "tg"]] = Query(None),
        stage: Optional[str] = Query(None),
        segment: Optional[Literal["A", "B", "C", "unknown"]] = Query(None),
        score_min: int = Query(0, ge=0, le=100),
        score_max: int = Query(100, ge=0, le=100),
        page: int = Query(1, ge=1),
        per_page: int = Query(20, ge=1, le=100),
    ):
        """Список клиентов с фильтрами для Pipeline."""
        if MOCK_MODE:
            items = MOCK_CLIENTS
            if channel:
                items = [c for c in items if c["channel"] == channel]
            if stage:
                items = [c for c in items if c["stage"] == stage]
            if segment:
                items = [c for c in items if c["segment"] == segment]
            items = [c for c in items if score_min <= c["score"] <= score_max]
            total = len(items)
            start = (page - 1) * per_page
            return ClientListResponse(
                items=[ClientOut(**c) for c in items[start:start + per_page]],
                total=total, page=page, per_page=per_page,
            )

        # TODO: реальный запрос к Postgres через SQLAlchemy
        raise HTTPException(status_code=501, detail="Production mode requires DB setup")


    @router.get("/{client_id}", response_model=ClientOut)
    async def get_client(client_id: str):
        if MOCK_MODE:
            for c in MOCK_CLIENTS:
                if c["id"] == client_id:
                    return ClientOut(**c)
            raise HTTPException(status_code=404, detail="Client not found")
        raise HTTPException(status_code=501, detail="Production mode requires DB")


    @router.post("/{client_id}/intercept")
    async def intercept(client_id: str):
        """Перехватить диалог — поставить агента на паузу."""
        if MOCK_MODE:
            return {"ok": True, "client_id": client_id, "status": "paused"}
        raise HTTPException(status_code=501)


    @router.post("/{client_id}/escalate")
    async def escalate(client_id: str, reason: str = "manual"):
        if MOCK_MODE:
            return {"ok": True, "client_id": client_id, "reason": reason, "status": "escalated"}
        raise HTTPException(status_code=501)
