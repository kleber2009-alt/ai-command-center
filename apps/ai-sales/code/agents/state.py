"""
State for the agent flow.
Каждый узел графа читает/обновляет этот state.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional, TypedDict

Channel = Literal["ig", "tg"]
Stage = Literal[
    "hello",
    "discovery",
    "pitch",
    "objections",
    "close",
    "followup",
    "won",
    "lost",
]
Segment = Literal["A", "B", "C", "unknown"]
EscalationReason = Literal[
    "complaint",
    "legal",
    "sensitive",
    "direct_request",
    "confused",
    "high_value",
    "special",
    "vip",
]


class AgentState(TypedDict, total=False):
    """Сквозной state, передаётся между узлами графа."""

    # --- input ---
    client_id: str
    channel: Channel
    incoming_message: str
    incoming_media_type: Optional[Literal["text", "voice", "image", "video"]]
    raw_payload: dict  # оригинальный webhook payload

    # --- tenant config (мультитенант) ---
    tenant_id: Optional[str]          # UUID из bot_tenants
    tenant_extra_prompt: Optional[str] # доп. системный промт клиента
    tenant_kb_collection: Optional[str] # Qdrant-коллекция клиента

    # --- enriched by classifier ---
    segment: Segment
    icp_match: int  # 0-100
    current_stage: Stage
    detected_intent: Optional[str]

    # --- enriched by RAG ---
    rag_chunks: list[dict]  # [{collection, content, similarity, ...}]
    rag_used: bool

    # --- escalation check ---
    needs_escalation: bool
    escalation_reason: Optional[EscalationReason]
    escalation_urgency: Optional[Literal["now", "1h", "today"]]

    # --- agent decision ---
    next_stage: Optional[Stage]
    response_text: str
    response_action: Optional[
        Literal["text", "voice", "circle", "image", "pdf", "kbd", "escalate"]
    ]
    suggested_followup_days: Optional[int]
    # Reasoning почему выбрали именно этот action (для дебага в дашборде)
    action_reason: Optional[str]
    # Параметры под media-генерацию
    media_duration_target_s: Optional[int]  # для voice/circle

    # --- conversation memory ---
    conversation_history: list  # [{direction, author, content}] из DB
    db_client_id: Optional[str]
    db_conversation_id: Optional[str]

    # --- meta ---
    model_used: str
    tokens_used: int
    latency_ms: int
    cost_usd: float
    errors: list[str]


def init_state(
    client_id: str,
    channel: Channel,
    incoming_message: str,
    raw_payload: dict | None = None,
) -> AgentState:
    """Создать новый state с дефолтными значениями."""
    return AgentState(
        client_id=client_id,
        channel=channel,
        incoming_message=incoming_message,
        incoming_media_type="text",
        raw_payload=raw_payload or {},
        segment="unknown",
        icp_match=0,
        current_stage="hello",
        rag_chunks=[],
        rag_used=False,
        needs_escalation=False,
        response_text="",
        errors=[],
        conversation_history=[],
        tokens_used=0,
        latency_ms=0,
        cost_usd=0.0,
    )
