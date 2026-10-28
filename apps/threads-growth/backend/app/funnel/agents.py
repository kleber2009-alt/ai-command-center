"""Агенты воронки на Claude: план дня, ветка, проверка, правка, приёмник, ответы.

Агенты — отдельные вызовы Messages API, а оркестрацию (что за чем, апрув,
расписание) держит код: так проще контролировать гейты «без ✅ не публикуем».
Системный промпт = скилл threads-telegram-funnel целиком (prompts/funnel_skill.md,
кешируется на час — общий для всех агентов) + роль агента. Ответ — строго JSON
по схеме (structured outputs), поэтому парсинг не ломается.

Модель — FUNNEL_MODEL (по умолчанию claude-opus-5-5). При отказе модели
включён server-side fallback (FUNNEL_FALLBACKS=1).
"""
from __future__ import annotations

import json
from typing import Any

from app.config import settings
from app.core.llm import load_prompt


class AgentError(RuntimeError):
    pass


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or list(props),
            "additionalProperties": False}


_STR = {"type": "string"}
_INT = {"type": "integer"}
_BOOL = {"type": "boolean"}
_STRS = {"type": "array", "items": _STR}
_HOOK = _obj({"text": _STR, "mechanic": _STR, "needs_proof": _BOOL})

PLAN_SCHEMA = _obj({"slots": {"type": "array", "items": _obj({
    "slot": _INT, "topic": _STR, "hypothesis": _STR, "reserve_id": _INT})}})
THREAD_SCHEMA = _obj({
    "hooks": {"type": "array", "items": _HOOK},
    "posts": _STRS,
    "mid_index": _INT,
    "receiver_id": _INT,
    "receiver_brief": _STR,
    "materials_request": _STR,
    "facts_needed": _STRS,
    "media_hint": _STR,
})
REVIEW_SCHEMA = _obj({
    "hooks": {"type": "array", "items": _HOOK},
    "posts": _STRS,
    "mid_index": _INT,
    "facts_needed": _STRS,
    "report": _STR,
})
EDIT_SCHEMA = _obj({"hook": _STR, "posts": _STRS, "facts_needed": _STRS, "summary": _STR})
HOOKS_SCHEMA = _obj({"hooks": {"type": "array", "items": _HOOK}})
RECEIVER_SCHEMA = _obj({
    "title": _STR,
    "kind": {"type": "string", "enum": ["prompts", "instruction", "assistant", "other"]},
    "contents": _STR,
    "clusters": {"type": "array", "items": _INT},
    "text": _STR,
})
CLASSIFY_SCHEMA = _obj({
    "title": _STR,
    "kind": {"type": "string", "enum": ["prompts", "instruction", "assistant", "other"]},
    "contents": _STR,
    "clusters": {"type": "array", "items": _INT},
})
REPLY_SCHEMA = _obj({"reply": _STR, "skip": _BOOL})


def _system(role: str) -> list[dict]:
    return [
        # Скилл одинаков для всех агентов → один кеш на все вызовы дня.
        {"type": "text", "text": load_prompt("funnel_skill"), "cache_control": {"type": "ephemeral", "ttl": "1h"}},
        {"type": "text", "text": load_prompt("funnel_author") + "\n\n" + load_prompt(role)},
    ]


def _structured(role: str, payload: str, schema: dict, *, effort: str, max_tokens: int = 16000) -> dict:
    """Один вызов агента → dict по схеме. Бросает AgentError с понятной причиной."""
    if not settings.anthropic_api_key:
        raise AgentError("ANTHROPIC_API_KEY не задан — агенты воронки не работают.")
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    kwargs: dict[str, Any] = {
        "model": settings.funnel_model,
        "max_tokens": max_tokens,
        "system": _system(role),
        "messages": [{"role": "user", "content": payload}],
        "output_config": {"effort": effort, "format": {"type": "json_schema", "schema": schema}},
    }
    if settings.funnel_fallbacks:
        kwargs["betas"] = ["server-side-fallback-2026-07-01"]
        kwargs["fallbacks"] = "default"
    try:
        with client.beta.messages.stream(**kwargs) as stream:
            msg = stream.get_final_message()
    except anthropic.RateLimitError as e:
        raise AgentError(f"Claude: лимит запросов, повторите позже ({e.message})") from e
    except anthropic.APIStatusError as e:
        raise AgentError(f"Claude {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise AgentError(f"Claude недоступен: {e}") from e

    if msg.stop_reason == "refusal":
        raise AgentError("Claude отказался выполнять запрос — переформулируйте тему.")
    if msg.stop_reason == "max_tokens":
        raise AgentError("Ответ Claude обрезан по max_tokens.")
    text = next((b.text for b in msg.content if b.type == "text"), "")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise AgentError(f"Claude вернул не-JSON: {text[:200]}") from e


def _dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=1)


def _context(voice_level: int, facts: list[str], receivers: list[dict] | None = None) -> str:
    parts = [f"Громкость голоса: {voice_level} из 5 (§8.2)."]
    parts.append("Банк фактов автора (личные цифры и истории — только отсюда):\n"
                 + ("\n".join(f"- {f}" for f in facts) if facts else "- (пусто)"))
    if receivers is not None:
        parts.append("Библиотека приёмников в канале:\n" + (_dump(receivers) if receivers else "(пусто)"))
    return "\n\n".join(parts)


# ── Агенты ───────────────────────────────────────────────────────────────────
def plan_topics(day: str, slots: list[dict], *, recent_topics: list[str], reserve: list[dict],
                donor_posts: list[dict], receivers: list[dict], facts: list[str]) -> list[dict]:
    """slots: [{"slot": i, "time": "10:00", "cluster": 1, "cluster_name": ..., "template": "A"}]."""
    payload = "\n\n".join([
        f"День: {day}",
        "Слоты:\n" + _dump(slots),
        "Темы последних двух недель (не повторять):\n" + ("\n".join(f"- {t}" for t in recent_topics) or "(нет)"),
        "Запас — пропущенные темы, можно взять (тогда reserve_id = id, иначе 0):\n"
        + (_dump(reserve) if reserve else "(пусто)"),
        "Посты доноров с высоким откликом (только механика):\n" + (_dump(donor_posts) if donor_posts else "(нет)"),
        _context(settings.funnel_voice_level, facts, receivers),
    ])
    res = _structured("funnel_plan", payload, PLAN_SCHEMA, effort="medium")
    return res.get("slots") or []


def write_thread(spec: dict, *, facts: list[str], receivers: list[dict], voice_level: int) -> dict:
    """spec: topic, hypothesis, cluster, cluster_name, template, template_name."""
    payload = "\n\n".join([
        "Ветка:\n" + _dump(spec),
        _context(voice_level, facts, receivers),
    ])
    return _structured("funnel_write", payload, THREAD_SCHEMA, effort="high", max_tokens=32000)


def review_thread(thread: dict, *, facts: list[str], receiver: dict | None, voice_level: int,
                  donor_texts: list[str]) -> dict:
    payload = "\n\n".join([
        "Ветка на проверку:\n" + _dump(thread),
        "Приёмник, на который ведёт ссылка:\n" + (_dump(receiver) if receiver else "(ещё нет — приёмник напишут отдельно)"),
        "Донорские тексты (сверь, что нет совпадений один в один):\n" + ("\n---\n".join(donor_texts) or "(нет)"),
        _context(voice_level, facts),
    ])
    return _structured("funnel_review", payload, REVIEW_SCHEMA, effort="medium", max_tokens=32000)


def edit_thread(thread: dict, instruction: str, *, facts: list[str], voice_level: int) -> dict:
    payload = "\n\n".join([
        "Ветка (hook — активный хук, posts — посты 2..N):\n" + _dump(thread),
        "Правка от автора:\n" + instruction,
        _context(voice_level, facts),
    ])
    return _structured("funnel_edit", payload, EDIT_SCHEMA, effort="medium", max_tokens=32000)


def fresh_hooks(thread: dict, used_hooks: list[str], *, facts: list[str], voice_level: int) -> list[dict]:
    """Новые хуки к телу для перевыпуска, когда очередь из 6 исчерпана (новый угол)."""
    payload = "\n\n".join([
        "Тело ветки:\n" + _dump(thread),
        "Уже выходившие хуки (не повторять механику подряд и формулировки):\n" + "\n---\n".join(used_hooks),
        "Сделай 6 новых хуков разной механики — новый угол на то же тело.",
        _context(voice_level, facts),
    ])
    return _structured("funnel_write", payload, HOOKS_SCHEMA, effort="high").get("hooks") or []


def draft_receiver(thread: dict, brief: str, *, facts: list[str]) -> dict:
    payload = "\n\n".join([
        "Ветка, которая ведёт на приёмник:\n" + _dump(thread),
        "Что должно быть в приёмнике:\n" + (brief or "(по смыслу ветки)"),
        _context(settings.funnel_voice_level, facts),
    ])
    return _structured("funnel_receiver", payload, RECEIVER_SCHEMA, effort="medium")


def edit_receiver(receiver: dict, instruction: str, *, facts: list[str]) -> dict:
    payload = "\n\n".join([
        "Пост-приёмник:\n" + _dump(receiver),
        "Правка от автора (меняй только это):\n" + instruction,
        _context(settings.funnel_voice_level, facts),
    ])
    return _structured("funnel_receiver", payload, RECEIVER_SCHEMA, effort="medium")


def classify_receiver(url: str, description: str) -> dict:
    payload = (f"Автор добавляет в библиотеку готовый пост канала {url}.\n"
               f"Описание от автора:\n{description}\n\n"
               "Верни title, kind, contents (что внутри) и clusters. Текст поста не нужен.")
    return _structured("funnel_receiver", payload, CLASSIFY_SCHEMA, effort="low")


def draft_reply(thread_topic: str, thread_excerpt: str, comment: str, author: str, *, facts: list[str]) -> dict:
    payload = "\n\n".join([
        f"Ветка автора: {thread_topic}\n{thread_excerpt[:1500]}",
        f"Комментарий от @{author}:\n{comment[:1500]}",
        _context(settings.funnel_voice_level, facts),
    ])
    return _structured("funnel_reply", payload, REPLY_SCHEMA, effort="low")
