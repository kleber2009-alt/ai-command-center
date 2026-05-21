"""
LangGraph DAG для одного входящего сообщения.

Граф:
    classify → escalation_check ─[escalation]→ escalate ──┐
                                                          ├→ persist → END
                ↓
              rag → generate ─────────────────────────────┘

Используется и для IG-Менеджера, и для TG-Менеджера (промпт выбирается в generate_node по state.channel).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

try:
    from langgraph.graph import StateGraph, END  # type: ignore
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False

from .state import AgentState, init_state
from .nodes import (
    classify_node,
    escalation_node,
    rag_node,
    generate_node,
    decide_action_node,
    escalate_action_node,
    persist_node,
)


def _route_after_escalation_check(state: AgentState) -> str:
    """Условный routing: если нужна эскалация — в escalate, иначе — в rag."""
    return "escalate" if state.get("needs_escalation") else "rag"


def build_graph():
    """Собрать LangGraph DAG. Если LangGraph не установлен — вернуть простой sequential runner."""
    if not HAS_LANGGRAPH:
        return _build_fallback_runner()

    g = StateGraph(AgentState)
    g.add_node("classify", classify_node)
    g.add_node("escalation_check", escalation_node)
    g.add_node("rag", rag_node)
    g.add_node("generate", generate_node)
    g.add_node("decide_action", decide_action_node)
    g.add_node("escalate", escalate_action_node)
    g.add_node("persist", persist_node)

    g.set_entry_point("classify")
    g.add_edge("classify", "escalation_check")
    g.add_conditional_edges(
        "escalation_check",
        _route_after_escalation_check,
        {"rag": "rag", "escalate": "escalate"},
    )
    g.add_edge("rag", "generate")
    g.add_edge("generate", "decide_action")
    g.add_edge("decide_action", "persist")
    g.add_edge("escalate", "persist")
    g.add_edge("persist", END)

    return g.compile()


def _build_fallback_runner():
    """Запасной вариант: последовательный pipeline без LangGraph."""

    def run(state: AgentState) -> AgentState:
        state = classify_node(state)
        state = escalation_node(state)
        if state.get("needs_escalation"):
            state = escalate_action_node(state)
        else:
            state = rag_node(state)
            state = generate_node(state)
            state = decide_action_node(state)
        state = persist_node(state)
        return state

    return run


def run_flow(
    client_id: str,
    channel: str,
    message: str,
    raw_payload: dict | None = None,
    tenant_config: dict | None = None,
    conversation_context: dict | None = None,
) -> AgentState:
    """Пройти полный путь сообщения через DAG."""
    state = init_state(
        client_id=client_id,
        channel=channel,  # type: ignore
        incoming_message=message,
        raw_payload=raw_payload,
    )
    if tenant_config:
        state['tenant_id'] = tenant_config.get('id')
        state['tenant_extra_prompt'] = tenant_config.get('system_prompt') or ''
        state['tenant_kb_collection'] = tenant_config.get('kb_collection') or ''
    graph = build_graph()

    if HAS_LANGGRAPH:
        result = graph.invoke(state)
    else:
        result = graph(state)

    return result


# ============ CLI for local testing ============

def main():
    parser = argparse.ArgumentParser(description="AI Sales agent flow test runner")
    parser.add_argument("--message", required=True, help="Входящее сообщение клиента")
    parser.add_argument("--client-id", default="test-client-001")
    parser.add_argument("--channel", default="ig", choices=["ig", "tg"])
    parser.add_argument("--mock", action="store_true", help="Принудительный mock-режим (default if no API key)")
    args = parser.parse_args()

    if args.mock:
        os.environ["AISALES_MOCK"] = "1"
    elif not os.environ.get("ANTHROPIC_API_KEY"):
        print("[!] ANTHROPIC_API_KEY not set, falling back to mock mode", file=sys.stderr)
        os.environ["AISALES_MOCK"] = "1"

    print(f"\n→ INPUT")
    print(f"  client_id: {args.client_id}")
    print(f"  channel:   {args.channel}")
    print(f"  message:   {args.message}")
    print()

    result = run_flow(
        client_id=args.client_id,
        channel=args.channel,
        message=args.message,
    )

    print("← OUTPUT")
    summary = {
        "detected_intent": result.get("detected_intent"),
        "current_stage": result.get("current_stage"),
        "segment": result.get("segment"),
        "needs_escalation": result.get("needs_escalation"),
        "escalation_reason": result.get("escalation_reason"),
        "rag_used": result.get("rag_used"),
        "rag_chunks_count": len(result.get("rag_chunks", [])),
        "response_action": result.get("response_action"),
        "response_text": result.get("response_text"),
        "latency_ms": result.get("latency_ms"),
        "cost_usd": result.get("cost_usd"),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print()


if __name__ == "__main__":
    main()
