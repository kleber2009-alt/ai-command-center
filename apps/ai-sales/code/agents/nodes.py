"""
Узлы LangGraph DAG.
Каждая функция принимает AgentState и возвращает обновлённый.

Mock-режим (AISALES_MOCK=1) — заглушки для тестов без API ключа.
Production (AISALES_MOCK=0) — реальные вызовы Anthropic API:
  - classify_node     → claude-sonnet-4-6 (быстро/дёшево, без thinking)
  - generate_node     → claude-opus-4-7 + adaptive thinking + effort=high
  - System prompts    → загружаются из agent-prompts/*.md
  - Prompt caching    → ephemeral 1h на system, экономит ~90% на повторных запросах
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from .state import AgentState, Stage, EscalationReason

log = logging.getLogger("aisales.agents.nodes")

MOCK_MODE = os.getenv("AISALES_MOCK", "1") == "1"

# Модели — можно переопределить через env
CLASSIFIER_MODEL = os.getenv("CLASSIFIER_MODEL", "claude-sonnet-4-6")
GENERATOR_MODEL = os.getenv("GENERATOR_MODEL", "claude-opus-4-7")

# Pricing (USD per 1M tokens) — актуально на май 2026
# https://platform.claude.com/docs/en/pricing
PRICING = {
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0, "cache_read": 0.30},
    "claude-opus-4-7":   {"input": 5.0, "output": 25.0, "cache_read": 0.50},
    "claude-opus-4-6":   {"input": 5.0, "output": 25.0, "cache_read": 0.50},
}

# Где лежат системные промпты
ROOT = Path(__file__).resolve().parents[2]
PROMPTS_DIR = ROOT / "agent-prompts"
PROMPT_FILES = {
    "ig": "01-ig-manager.md",
    "tg": "02-tg-manager.md",
    "analyst": "03-analyst.md",
    "rop": "04-rop.md",
}


# ============ Helpers ============

def _load_system_prompt(channel: str) -> str:
    """Загрузить системный промпт для канала."""
    fname = PROMPT_FILES.get(channel, PROMPT_FILES["ig"])
    path = PROMPTS_DIR / fname
    if not path.exists():
        log.warning("Prompt file not found: %s — using fallback", path)
        return (
            "Ты — менеджер по продажам. Общайся с клиентом тепло, по делу, "
            "без канцеляризмов. Отвечай на «ты» по умолчанию. "
            "Если запрос сложный или клиент жалуется — эскалируй на Илью."
        )
    return path.read_text(encoding="utf-8")


def _extract_json(text: str) -> dict | None:
    """Достать первый валидный JSON-объект из текста."""
    # Прямой парс если уже JSON
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Найти { ... } внутри
    match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _track_cost(state: AgentState, model: str, usage: Any) -> None:
    """Обновить tokens_used и cost_usd в state по usage от Anthropic."""
    p = PRICING.get(model, PRICING["claude-sonnet-4-6"])
    inp = getattr(usage, "input_tokens", 0)
    out = getattr(usage, "output_tokens", 0)
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_create = getattr(usage, "cache_creation_input_tokens", 0) or 0

    # Cache writes cost 1.25x of base input price (5min TTL) or 2x (1h TTL)
    # Здесь упрощённо считаем как 1.25x — потом можно уточнить по TTL
    cost = (
        inp / 1_000_000 * p["input"]
        + out / 1_000_000 * p["output"]
        + cache_read / 1_000_000 * p["cache_read"]
        + cache_create / 1_000_000 * (p["input"] * 1.25)
    )
    state["tokens_used"] = state.get("tokens_used", 0) + inp + out + cache_read + cache_create
    state["cost_usd"] = round(state.get("cost_usd", 0.0) + cost, 6)
    state["model_used"] = model


# ============ NODE 1: CLASSIFY ============

def classify_node(state: AgentState) -> AgentState:
    """
    Определить:
    - какой этап воронки сейчас (по истории + новому сообщению)
    - сегмент клиента (A / B / C / unknown)
    - intent текущего сообщения (вопрос / возражение / готовность купить / ...)
    """
    start = time.time()

    if MOCK_MODE:
        # Простая эвристика для теста
        msg = state["incoming_message"].lower()
        if any(w in msg for w in ["привет", "здравствуй", "hi"]):
            state["current_stage"] = "hello"
            state["detected_intent"] = "greeting"
        elif any(w in msg for w in ["сколько", "цена", "стоит", "как купить"]):
            state["current_stage"] = "close"
            state["detected_intent"] = "price_question"
        elif any(w in msg for w in ["дорого", "не подходит", "подумаю"]):
            state["current_stage"] = "objections"
            state["detected_intent"] = "objection"
        else:
            state["current_stage"] = "discovery"
            state["detected_intent"] = "general_question"

        state["segment"] = "unknown"
        state["icp_match"] = 50
    else:
        try:
            _classify_real(state)
        except Exception as e:
            log.exception("classify_node failed: %s", e)
            state["errors"] = state.get("errors", []) + [f"classify: {type(e).__name__}: {e}"]
            # Fallback на простую эвристику чтобы flow не падал полностью
            state["current_stage"] = state.get("current_stage", "hello")
            state["segment"] = "unknown"
            state["icp_match"] = 0
            state["detected_intent"] = "other"

    state["latency_ms"] = state.get("latency_ms", 0) + int((time.time() - start) * 1000)
    return state


# ============ Real Classifier (Sonnet 4.6) ============

CLASSIFIER_SYSTEM = """Ты — классификатор сообщений клиента в воронке продаж.

# Этапы воронки
- hello: первое касание, знакомство
- discovery: выявление потребности, контекст
- pitch: презентация решения
- objections: возражения клиента
- close: переход к оплате
- followup: догрев после паузы
- won: оплата получена
- lost: отказ

# Сегменты (по сигналам в речи)
- A: ICP 70+, готов покупать, прямые вопросы о цене, конкретные сценарии использования
- B: ICP 40-70, в раздумьях, спрашивает кейсы, "подумаю", "интересно"
- C: ICP <40, далёк от покупки, односложные ответы, "просто смотрю"
- unknown: недостаточно данных или нет сигналов

# Намерения
- greeting: приветствие, начало разговора
- question: общий вопрос о продукте/услуге
- price_question: вопрос о стоимости / "сколько"
- objection: возражение ("дорого", "не подходит", "подумаю")
- agreement: согласие, готовность купить
- complaint: жалоба, негатив
- confused: не понимает, переспрашивает третий раз
- other: всё остальное

# Задача
По ОДНОМУ сообщению клиента (текст ниже) определи структуру.

Верни СТРОГО валидный JSON без markdown, без пояснений:
{
  "detected_intent": "<один из 8>",
  "current_stage": "<один из 8>",
  "segment": "<A|B|C|unknown>",
  "icp_match": <0-100>
}
"""


def _classify_real(state: AgentState) -> None:
    """Реальная классификация через Claude Sonnet 4.6."""
    from anthropic import Anthropic
    import anthropic as anthropic_pkg

    client = Anthropic()
    message = state["incoming_message"]

    try:
        response = client.messages.create(
            model=CLASSIFIER_MODEL,
            max_tokens=256,
            system=[
                {
                    "type": "text",
                    "text": CLASSIFIER_SYSTEM,
                    "cache_control": {"type": "ephemeral", "ttl": "1h"},
                }
            ],
            messages=[
                {"role": "user", "content": f"Сообщение клиента:\n\n{message}"}
            ],
        )
    except anthropic_pkg.RateLimitError as e:
        log.warning("classify · rate limit, fallback to defaults: %s", e)
        raise
    except anthropic_pkg.APIError as e:
        log.error("classify · API error %s: %s", e.status_code, e.message)
        raise

    # Извлечь текст из ответа
    raw = ""
    for block in response.content:
        if block.type == "text":
            raw += block.text

    data = _extract_json(raw)
    if not data:
        log.warning("classify · could not parse JSON from: %s", raw[:200])
        raise ValueError(f"Invalid JSON from classifier: {raw[:200]}")

    # Валидация и запись в state
    state["detected_intent"] = data.get("detected_intent", "other")
    state["current_stage"] = data.get("current_stage", "hello")
    state["segment"] = data.get("segment", "unknown")
    icp = data.get("icp_match", 0)
    state["icp_match"] = int(icp) if isinstance(icp, (int, float)) else 0

    _track_cost(state, CLASSIFIER_MODEL, response.usage)
    log.info(
        "classify · stage=%s segment=%s icp=%d intent=%s · %dms",
        state["current_stage"], state["segment"], state["icp_match"],
        state["detected_intent"],
        int((time.time()) * 1000) % 100000,
    )


# ============ NODE 2: ESCALATION CHECK ============

ESCALATION_TRIGGERS: dict[EscalationReason, list[str]] = {
    "complaint": ["обманули", "ужасно", "разочарован", "верните деньги", "жалоба"],
    "legal": ["суд", "прокуратура", "152-фз", "юрист", "адвокат"],
    "sensitive": ["самоубийст", "депрессия", "болезн", "терапия"],
    "direct_request": ["с самим", "к ил", "к ольге", "хочу с владельц"],
}


def escalation_node(state: AgentState) -> AgentState:
    """Проверить, нужна ли эскалация на человека."""
    msg = state["incoming_message"].lower()

    for reason, triggers in ESCALATION_TRIGGERS.items():
        if any(t in msg for t in triggers):
            state["needs_escalation"] = True
            state["escalation_reason"] = reason
            state["escalation_urgency"] = "now" if reason == "complaint" else "1h"
            return state

    # Скоринг по правилам (заглушка — настоящая логика в analyst)
    if state.get("detected_intent") == "confused_repeated":
        state["needs_escalation"] = True
        state["escalation_reason"] = "confused"
        state["escalation_urgency"] = "today"

    return state


# ============ NODE 3: RAG ============

def rag_node(state: AgentState) -> AgentState:
    """
    Получить релевантные чанки из базы знаний (Qdrant + Voyage-3 эмбеддинги).
    Топ-K записей из 5 коллекций (voice / products / segments / objections / content).
    """
    start = time.time()

    if MOCK_MODE:
        # Мок-чанки в зависимости от этапа
        stage = state.get("current_stage", "hello")
        mock_chunks = {
            "hello": [
                {"collection": "voice", "content": "Базовый тон: на 'ты', без эмодзи", "similarity": 0.91},
                {"collection": "voice", "content": "Биография: Илья, помогаю агентствам", "similarity": 0.85},
            ],
            "objections": [
                {"collection": "objections", "content": "Дорого → диагностический вопрос", "similarity": 0.93},
                {"collection": "voice", "content": "Скидка только под условие", "similarity": 0.78},
            ],
            "close": [
                {"collection": "products", "content": "Автопилот SMM · 80 000 ₽ · 3-5 дней внедрение", "similarity": 0.95},
                {"collection": "voice", "content": "При сумме >100к — созвон с Ильёй", "similarity": 0.82},
            ],
        }
        state["rag_chunks"] = mock_chunks.get(stage, [])
        state["rag_used"] = bool(state["rag_chunks"])
    else:
        query = state.get("incoming_message", "")
        try:
            from openai import OpenAI
            from qdrant_client import QdrantClient

            _openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
            _qdrant = QdrantClient(
                url=os.getenv("QDRANT_URL", "http://aisales-qdrant:6333"),
                api_key=os.getenv("QDRANT_API_KEY", ""),
            )

            emb_resp = _openai.embeddings.create(model="text-embedding-3-small", input=[query])
            q_vec = emb_resp.data[0].embedding

            hits = _qdrant.search(
                collection_name="aisales_kb",
                query_vector=q_vec,
                limit=4,
                score_threshold=0.20,
            )
            state["rag_chunks"] = [
                {
                    "collection": "aisales_kb",
                    "content": h.payload.get("text", ""),
                    "title": h.payload.get("title", ""),
                    "similarity": round(h.score, 3),
                }
                for h in hits
            ]
            state["rag_used"] = bool(state["rag_chunks"])
            log.info("rag · %d чанков (top score=%.2f)", len(hits), hits[0].score if hits else 0)
        except Exception as e:
            log.warning("rag · ошибка поиска: %s", e)
            state["rag_chunks"] = []
            state["rag_used"] = False

    # Если у тенанта есть своя KB — ищем и мержим
    tenant_kb_col = state.get("tenant_kb_collection")
    if tenant_kb_col:
        try:
            from services.tenant_kb import search_tenant_kb
            query = state.get("incoming_message", "")
            if not hasattr(rag_node, "_openai_cache"):
                from openai import OpenAI
                rag_node._openai_cache = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
            emb = rag_node._openai_cache.embeddings.create(model="text-embedding-3-small", input=[query])
            tenant_hits = search_tenant_kb(state.get("tenant_id", tenant_kb_col), emb.data[0].embedding)
            if tenant_hits:
                state["rag_chunks"] = tenant_hits + state.get("rag_chunks", [])
                state["rag_used"] = True
                log.info("rag · +%d tenant чанков", len(tenant_hits))
        except Exception as e:
            log.warning("rag · tenant search failed: %s", e)

    state["latency_ms"] = state.get("latency_ms", 0) + int((time.time() - start) * 1000)
    return state


# ============ NODE 4: GENERATE ============

def _build_messages(history: list[dict], current_user_block: str) -> list[dict]:
    """Convert DB history to Anthropic multi-turn messages format."""
    msgs = []
    for h in history:
        direction = h.get("direction", "")
        content = h.get("content") or ""
        if not content:
            continue
        if direction == "in":
            msgs.append({"role": "user", "content": content})
        elif direction == "out":
            msgs.append({"role": "assistant", "content": content})
    msgs.append({"role": "user", "content": current_user_block})
    return msgs


def generate_node(state: AgentState) -> AgentState:
    """
    Сгенерировать ответ через Claude Opus с учётом:
    - системного промпта агента (IG / TG)
    - истории диалога
    - RAG-чанков
    - текущего этапа
    """
    start = time.time()

    if MOCK_MODE:
        # Мок-ответы по этапам
        stage = state.get("current_stage", "hello")
        mock_responses = {
            "hello": "Привет! Из какого ты города и чем занимаешься? Чтобы было о чём говорить предметно.",
            "discovery": "Понял. А где сейчас узкое место? Что отнимает больше всего времени?",
            "pitch": "Под твою ситуацию у меня есть Автопилот SMM. В двух строках: автоматизирует постинг на 10 аккаунтов параллельно. Скинуть детали?",
            "objections": "Понимаю — цифра не маленькая. Давай разложу: 80к — это 4 месяца SMM-щика на полставки. Окупается на 2-3 клиенте. Хочешь — посчитаем на твоих?",
            "close": "Окей, отправляю ссылку на оплату. После — сразу подключаю в онбординг, в течение часа всё настроим.",
        }
        state["response_text"] = mock_responses.get(stage, "[mock response]")
        state["response_action"] = "text"
        state["model_used"] = "claude-opus-4.7 (mock)"
        state["tokens_used"] = 150
        state["cost_usd"] = 0.003
    else:
        try:
            _generate_real(state)
        except Exception as e:
            log.exception("generate_node failed: %s", e)
            state["errors"] = state.get("errors", []) + [f"generate: {type(e).__name__}: {e}"]
            # Graceful fallback: эскалируем на Илью, не вешаемся
            state["response_text"] = (
                "Прости, на стороне системы что-то отвалилось. "
                "Илья сейчас подключится — буквально пару минут."
            )
            state["response_action"] = "text"
            state["needs_escalation"] = True
            state["escalation_reason"] = "special"  # system error
            state["escalation_urgency"] = "now"

    state["latency_ms"] = state.get("latency_ms", 0) + int((time.time() - start) * 1000)
    return state


# ============ Real Generator (Opus 4.7 + adaptive thinking) ============

def _generate_real(state: AgentState) -> None:
    """
    Реальная генерация ответа через Claude Opus 4.7.

    Особенности:
    - Adaptive thinking (не budget_tokens — это удалено в 4.7)
    - Effort = high для качества
    - System prompt из agent-prompts/ с prompt-caching 1h (экономит ~90% на повторах)
    - Streaming для безопасности (на случай длинного ответа с thinking)
    - Опционально подключает RAG-чанки и историю диалога если есть
    """
    from anthropic import Anthropic
    import anthropic as anthropic_pkg

    client = Anthropic()
    channel = state.get("channel", "ig")
    system_prompt = _load_system_prompt(channel)
    tenant_extra = state.get("tenant_extra_prompt") or ""
    if tenant_extra:
        system_prompt = tenant_extra + "\n\n---\n\n" + system_prompt

    # Контекст клиента для модели
    rag_chunks = state.get("rag_chunks", [])
    rag_block = ""
    if rag_chunks:
        chunks_text = "\n".join(
            f"- [{c.get('collection', '?')}] {c.get('content', '')}"
            for c in rag_chunks
        )
        rag_block = f"\n\n# RAG · РЕЛЕВАНТНЫЕ ЧАНКИ ИЗ БАЗЫ ЗНАНИЙ\n{chunks_text}"

    user_block = f"""<client_context>
<channel>{channel}</channel>
<current_stage>{state.get('current_stage', 'hello')}</current_stage>
<segment>{state.get('segment', 'unknown')}</segment>
<icp_match>{state.get('icp_match', 0)}</icp_match>
<detected_intent>{state.get('detected_intent', 'other')}</detected_intent>
<media_type>{state.get('incoming_media_type', 'text')}</media_type>
</client_context>
{rag_block}

# СООБЩЕНИЕ КЛИЕНТА

{state['incoming_message']}

# ИНСТРУКЦИЯ
Ответь как менеджер согласно правилам в твоём системном промпте.
Один ответ — одна мысль, без полотен. Не используй emoji за исключением случаев которые разрешены в стиле.
На «ты» по умолчанию.
ВАЖНО: если выше присутствует история диалога (предыдущие сообщения) — НЕ начинай ответ с приветствия («Привет», «Здравствуй» и т.п.). Приветствуй только если это буквально первое сообщение клиента и истории нет.
Если клиент явно говорит "хочу купить" / "давай куплю" / "покупаю" — не задавай больше квалифицирующих вопросов. Сразу переходи к close: покажи конкретные варианты и CTA.
"""

    # Параметры запроса. thinking/output_config — если SDK поддерживает.
    # На старых SDK будет 400 от API или TypeError на этапе validate.
    call_kwargs = {
        "model": GENERATOR_MODEL,
        "max_tokens": 8000,
        "system": [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral", "ttl": "1h"},
            }
        ],
        "messages": _build_messages(state.get("conversation_history", []), user_block),
    }
    if os.getenv("AISALES_USE_THINKING", "1") == "1":
        call_kwargs["thinking"] = {"type": "adaptive"}
    if os.getenv("AISALES_USE_EFFORT", "1") == "1":
        call_kwargs["output_config"] = {"effort": "high"}

    try:
        final = client.messages.create(**call_kwargs)
    except TypeError as e:
        # SDK не знает параметра — пробуем без thinking/output_config
        log.warning("generate · SDK fallback (no thinking/output_config): %s", e)
        call_kwargs.pop("thinking", None)
        call_kwargs.pop("output_config", None)
        final = client.messages.create(**call_kwargs)
    except anthropic_pkg.RateLimitError as e:
        log.warning("generate · rate limit: %s", e)
        raise
    except anthropic_pkg.APIError as e:
        log.error("generate · API error %s: %s", e.status_code, e.message)
        raise

    # Достаём текст (пропускаем thinking blocks)
    response_text = ""
    for block in final.content:
        if block.type == "text":
            response_text += block.text

    response_text = response_text.strip()
    if not response_text:
        # Если ответ пустой (только thinking) — попробуем фразу-заглушку
        response_text = "Секунду, обдумаю..."
        log.warning("generate · empty response, using placeholder")

    state["response_text"] = response_text
    state["response_action"] = "text"  # decide_action_node может изменить на voice/circle

    _track_cost(state, GENERATOR_MODEL, final.usage)
    log.info(
        "generate · %d chars · stop=%s · in=%d out=%d cache_read=%d",
        len(response_text),
        final.stop_reason,
        final.usage.input_tokens,
        final.usage.output_tokens,
        getattr(final.usage, "cache_read_input_tokens", 0) or 0,
    )


# ============ NODE 5: ESCALATE ============

def escalate_action_node(state: AgentState) -> AgentState:
    """Если эскалация — формируем алерт Илье + ставим агента на паузу для этого клиента."""
    state["response_action"] = "escalate"
    state["response_text"] = (
        "[ESCALATION] Илья получит уведомление и ответит лично. "
        f"Причина: {state.get('escalation_reason')}. "
        f"Срочность: {state.get('escalation_urgency')}."
    )

    # В реальном коде здесь:
    # 1. POST /api/v1/escalations с деталями
    # 2. send_to_ilya_tg(summary)
    # 3. mark_client_paused(client_id, ttl=24h)

    return state


# ============ NODE 5.5: DECIDE ACTION (text / voice / circle) ============

def decide_action_node(state: AgentState) -> AgentState:
    """
    Решает каким способом ответить: text / voice / circle.

    Правила (соответствуют agent-prompts/02-tg-manager.md):

    КРУЖОК если:
    - channel = tg И
    - сегмент A И score >= 70 И
    - первое сообщение в этапе pitch ИЛИ
    - сложная концепция (стадия pitch или close) ИЛИ
    - эмоциональный момент (поздравить с покупкой)

    ГОЛОС если:
    - клиент сам отправил voice (отвечаем тем же форматом)
    - длинный ответ в стадии pitch (>200 символов)
    - стадия followup (голос «вырывает» из ленты)

    ТЕКСТ во всех остальных случаях.

    Для IG ограничение: кружок не отправляем (нет API), голос — как audio attachment.
    """
    # Если уже выбран escalate — не трогаем
    if state.get("response_action") == "escalate":
        state["action_reason"] = "escalation override"
        return state

    # /voice on от владельца — форс голос (если канал поддерживает)
    if Path("/tmp/aisales-voice-force").exists():
        if state.get("channel") == "tg":
            state["response_action"] = "voice"
            state["action_reason"] = "owner forced voice mode (/voice on)"
            state["media_duration_target_s"] = 30
            return state

    channel = state.get("channel", "ig")
    stage = state.get("current_stage", "hello")
    segment = state.get("segment", "unknown")
    score = state.get("icp_match", 0)
    text_length = len(state.get("response_text", ""))
    incoming_media_type = state.get("incoming_media_type", "text")

    # Mirror: клиент прислал voice/circle → отвечаем голосом
    if incoming_media_type in ("voice", "circle"):
        state["response_action"] = "voice" if channel == "tg" else "voice"
        state["action_reason"] = f"mirror client's {incoming_media_type}"
        state["media_duration_target_s"] = 30
        return state

    # КРУЖОК (только TG)
    if channel == "tg":
        if stage == "pitch" and segment == "A" and score >= 70:
            state["response_action"] = "circle"
            state["action_reason"] = "first pitch on hot lead — circle for trust"
            state["media_duration_target_s"] = 30
            return state
        if stage == "close" and segment == "A":
            state["response_action"] = "circle"
            state["action_reason"] = "closing hot deal — face contact builds trust"
            state["media_duration_target_s"] = 25
            return state

    # ГОЛОС
    if text_length > 200 and stage in ("pitch", "objections"):
        state["response_action"] = "voice"
        state["action_reason"] = f"long response ({text_length} chars) → voice better"
        state["media_duration_target_s"] = min(60, text_length // 8)
        return state

    if stage == "followup" and segment in ("A", "B"):
        state["response_action"] = "voice"
        state["action_reason"] = "followup voice — emotional reach"
        state["media_duration_target_s"] = 20
        return state

    # ДЕФОЛТ — text
    state["response_action"] = "text"
    state["action_reason"] = "default text response"
    return state


# ============ NODE 6: PERSIST ============

def persist_node(state: AgentState) -> AgentState:
    """Сохранить результат в Postgres: переход этапа, scoring, действие."""
    if MOCK_MODE:
        return state

    # TODO: реальная запись
    # async with db.transaction():
    #     await db.execute("INSERT INTO agent_actions ...", state)
    #     if state.get("next_stage") != state.get("current_stage"):
    #         await db.execute("UPDATE clients SET stage = ...", state)
    return state
